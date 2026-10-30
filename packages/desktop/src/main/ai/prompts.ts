import type { AiAction, AiRequest } from '@shared/types/ai'

export const SYSTEM_PROMPT = [
  'You are a writing assistant inside a Markdown editor.',
  'The user selected a passage and gives an instruction for it.',
  'Reply with only the Markdown that will be inserted into the document:',
  'no preamble, no explanation, no surrounding code fence.',
  "Keep the passage's language, Markdown formatting, links and code unless the instruction says otherwise."
].join(' ')

const ACTION_INSTRUCTIONS: Record<Exclude<AiAction, 'custom'>, string> = {
  refine: 'Improve clarity, flow and word choice while keeping the meaning and tone.',
  'fix-grammar': 'Fix spelling, grammar and punctuation. Change nothing else.',
  shorter: 'Make it more concise while keeping all key information.',
  longer: 'Expand it with relevant detail while keeping the tone.'
}

export const buildUserPrompt = (request: AiRequest): string => {
  const instruction =
    request.action === 'custom'
      ? (request.instruction ?? '').trim()
      : ACTION_INSTRUCTIONS[request.action]
  return `Instruction: ${instruction}\n\n<selection>\n${request.text}\n</selection>`
}

// Models often wrap the whole reply in a fence despite the system prompt; a
// fence that only covers part of the reply is real content and stays.
export const stripWrappingFence = (text: string): string => {
  const match = /^\s*```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```\s*$/i.exec(text)
  return match ? match[1] : text
}
