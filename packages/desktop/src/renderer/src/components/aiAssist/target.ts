import type { AiAction } from '@shared/types/ai'

export type AiPlacement = 'replace' | 'after'

/**
 * The selection an AI request runs on, captured by whichever editor (Muya or
 * CodeMirror) owned it when the panel opened. `apply` rejects when that
 * selection can no longer be restored unchanged.
 */
export interface AiAssistTarget {
  /** Markdown source of the selection. */
  text: string
  /** Viewport rectangle of the selection, used to place the panel. */
  rect: DOMRect | null
  apply: (markdown: string, placement: AiPlacement) => Promise<void>
  /** Return keyboard focus to the owning editor. */
  focus: () => void
}

export interface AiAssistOpenPayload {
  action: AiAction
  target: AiAssistTarget
}

export const AI_ASSIST_OPEN = 'ai-assist-open'

export const isAiAction = (value: unknown): value is AiAction =>
  value === 'refine' ||
  value === 'fix-grammar' ||
  value === 'shorter' ||
  value === 'longer' ||
  value === 'custom'

export const selectionRect = (): DOMRect | null => {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  return rect.width || rect.height ? rect : null
}
