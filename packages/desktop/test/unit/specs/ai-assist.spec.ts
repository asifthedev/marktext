// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream } from 'ai'

const { handlers, keytar } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  keytar: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(channel, handler),
    on: vi.fn()
  }
}))
vi.mock('keytar', () => ({ default: keytar }))
vi.mock('electron-log', () => ({ default: { error: vi.fn(), warn: vi.fn() } }))

import { registerAiHandlers, runAiRequest } from 'main_renderer/ai'
import { SYSTEM_PROMPT, buildUserPrompt, stripWrappingFence } from 'main_renderer/ai/prompts'

const invoke = (channel: string, ...args: unknown[]) => {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`Missing AI handler: ${channel}`)
  return handler(...args)
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 }
}

const streamingModel = (chunks: unknown[]) =>
  new MockLanguageModelV4({
    doStream: async() => ({
      stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null })
    }) as never
  })

const textChunks = (...deltas: string[]) => [
  { type: 'text-start', id: 't' },
  ...deltas.map(delta => ({ type: 'text-delta', id: 't', delta })),
  { type: 'text-end', id: 't' },
  { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }
]

describe('AI prompts', () => {
  it('uses the preset instruction for built-in actions', () => {
    const prompt = buildUserPrompt({ action: 'fix-grammar', text: 'teh cat', instruction: 'ignored' })
    expect(prompt).toContain('Fix spelling, grammar and punctuation.')
    expect(prompt).not.toContain('ignored')
    expect(prompt).toContain('<selection>\nteh cat\n</selection>')
  })

  it('uses the user instruction for custom prompts', () => {
    const prompt = buildUserPrompt({ action: 'custom', text: 'a, b', instruction: '  Make a table  ' })
    expect(prompt.startsWith('Instruction: Make a table\n')).toBe(true)
  })

  it('removes a fence that wraps the whole reply only', () => {
    expect(stripWrappingFence('```markdown\n# Title\n```')).toBe('# Title')
    expect(stripWrappingFence('```\nplain\n```\n')).toBe('plain')
    const partial = 'Intro\n\n```js\ncode()\n```'
    expect(stripWrappingFence(partial)).toBe(partial)
  })
})

describe('runAiRequest', () => {
  it('streams deltas and resolves with the full reply', async() => {
    const model = streamingModel(textChunks('```md\nHello', ' **world**\n```'))
    const deltas: string[] = []

    const text = await runAiRequest(model, { action: 'refine', text: 'hi' }, d => deltas.push(d))

    expect(deltas).toEqual(['```md\nHello', ' **world**\n```'])
    expect(text).toBe('Hello **world**')
    const [call] = model.doStreamCalls
    expect(call.prompt[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
  })

  it('rejects when the provider reports an error', async() => {
    const model = streamingModel([
      { type: 'text-start', id: 't' },
      { type: 'error', error: new Error('quota exceeded') }
    ])

    await expect(runAiRequest(model, { action: 'refine', text: 'hi' }, () => {}))
      .rejects.toThrow('quota exceeded')
  })
})

describe('AI IPC handlers', () => {
  const originalEnvKey = process.env.OPENAI_API_KEY

  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    delete process.env.OPENAI_API_KEY
    registerAiHandlers(() => ({ model: 'gpt-4.1-mini', baseUrl: '' }))
  })

  afterEach(() => {
    if (originalEnvKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalEnvKey
  })

  it('reports a missing API key without calling the provider', async() => {
    keytar.getPassword.mockResolvedValue(null)
    const sender = { send: vi.fn(), isDestroyed: () => false }

    const result = await invoke('mt::ai::run', { sender }, 'r1', { action: 'refine', text: 'hi' })

    expect(result).toEqual({ ok: false, reason: 'missing-api-key' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('falls back to OPENAI_API_KEY when the keychain is unavailable', async() => {
    keytar.getPassword.mockRejectedValue(new Error('no secret service'))
    process.env.OPENAI_API_KEY = 'sk-env'

    expect(await invoke('mt::ai::has-api-key', {})).toBe(true)
  })

  it('stores a trimmed key and deletes it when cleared', async() => {
    await invoke('mt::ai::set-api-key', {}, '  sk-test  ')
    expect(keytar.setPassword).toHaveBeenCalledWith('marktext', 'aiApiKey', 'sk-test')

    await invoke('mt::ai::set-api-key', {}, '   ')
    expect(keytar.deletePassword).toHaveBeenCalledWith('marktext', 'aiApiKey')
  })
})
