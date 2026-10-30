import type { AiAction } from '@shared/types/ai'

export type AiPlacement = 'replace' | 'after'

/** An AI answer placed in the document, pending the user's decision. */
export interface AiPreview {
  /**
   * Remove the answer and restore the original text and selection. Throws,
   * leaving the document untouched, if it was edited after the preview.
   */
  revert: () => void
}

/**
 * The selection an AI request runs on, captured by whichever editor (Muya or
 * CodeMirror) owned it when the panel opened. `apply` puts an answer into the
 * document as a revertible preview; it rejects when the selection can no
 * longer be restored unchanged.
 */
export interface AiAssistTarget {
  /** Markdown source of the selection. */
  text: string
  /** Viewport rectangle of the selection, used to place the panel. */
  rect: DOMRect | null
  apply: (markdown: string, placement: AiPlacement) => Promise<AiPreview>
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
