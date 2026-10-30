import { ipcMain } from 'electron'
import keytar from 'keytar'
import log from 'electron-log'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText, type LanguageModel } from 'ai'
import type { AiRequest, AiResult } from '@shared/types/ai'
import { SYSTEM_PROMPT, buildUserPrompt, stripWrappingFence } from './prompts'

const KEYTAR_SERVICE = 'marktext'
const KEYTAR_ACCOUNT = 'aiApiKey'

export interface AiSettings {
  model: string
  /** Empty means the provider's default endpoint. */
  baseUrl: string
}

// The OS keychain is the only place the key is stored; OPENAI_API_KEY is a
// fallback for systems without a keychain (e.g. Linux without libsecret).
const readApiKey = async(): Promise<string | null> => {
  try {
    const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
    if (stored) return stored
  } catch (error) {
    log.warn('AI: cannot read the API key from the keychain:', error)
  }
  return process.env.OPENAI_API_KEY || null
}

// The Chat Completions API (not Responses) keeps custom base URLs working with
// OpenAI-compatible servers such as Ollama, LM Studio or OpenRouter.
export const createAiModel = (settings: AiSettings, apiKey: string): LanguageModel =>
  createOpenAI({ apiKey, baseURL: settings.baseUrl.trim() || undefined }).chat(settings.model)

/**
 * Stream the model's answer for `request`, reporting each text fragment via
 * `onDelta`, and resolve with the full Markdown to insert. Rejects on provider
 * errors and when `abortSignal` fires.
 */
export const runAiRequest = async(
  model: LanguageModel,
  request: AiRequest,
  onDelta: (delta: string) => void,
  abortSignal?: AbortSignal
): Promise<string> => {
  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(request),
    abortSignal
  })
  let text = ''
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text
      onDelta(part.text)
    } else if (part.type === 'error') {
      throw part.error
    }
  }
  abortSignal?.throwIfAborted()
  return stripWrappingFence(text).trim()
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const registerAiHandlers = (getSettings: () => AiSettings): void => {
  // Keyed by the renderer-chosen request id so `mt::ai::cancel` can stop it.
  const pending = new Map<string, AbortController>()

  ipcMain.handle('mt::ai::has-api-key', async() => !!(await readApiKey()))

  // The key is write-only from the renderer's side: it is never sent back.
  ipcMain.handle('mt::ai::set-api-key', async(_event, apiKey: string) => {
    const trimmed = apiKey.trim()
    if (trimmed) {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, trimmed)
    } else {
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
    }
  })

  ipcMain.handle('mt::ai::run', async(event, requestId: string, request: AiRequest): Promise<AiResult> => {
    const apiKey = await readApiKey()
    if (!apiKey) return { ok: false, reason: 'missing-api-key' }

    const controller = new AbortController()
    pending.set(requestId, controller)
    try {
      const text = await runAiRequest(
        createAiModel(getSettings(), apiKey),
        request,
        (delta) => {
          if (!event.sender.isDestroyed()) event.sender.send('mt::ai::delta', requestId, delta)
        },
        controller.signal
      )
      return { ok: true, text }
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, reason: 'aborted' }
      log.error('AI request failed:', error)
      return { ok: false, reason: 'failed', message: errorMessage(error) }
    } finally {
      pending.delete(requestId)
    }
  })

  ipcMain.on('mt::ai::cancel', (_event, requestId: string) => {
    pending.get(requestId)?.abort()
  })
}
