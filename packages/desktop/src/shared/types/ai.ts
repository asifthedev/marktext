export type AiAction = 'refine' | 'fix-grammar' | 'shorter' | 'longer' | 'custom'

export interface AiRequest {
  action: AiAction
  /** Markdown source of the user's selection. */
  text: string
  /** Free-form instruction; required for `custom`, ignored otherwise. */
  instruction?: string
}

export type AiResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'missing-api-key' | 'aborted' }
  | { ok: false; reason: 'failed'; message: string }
