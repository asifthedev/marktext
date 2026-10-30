<template>
  <div
    v-if="target"
    ref="panelRef"
    class="ai-assist"
    :style="panelStyle"
    role="dialog"
    tabindex="-1"
    :aria-label="t('contextMenu.ai.title')"
    dir="ltr"
    @keydown.esc.stop.prevent="close"
  >
    <div class="ai-assist-actions">
      <button
        v-for="item in presetActions"
        :key="item.action"
        type="button"
        class="ai-chip"
        :class="{ active: lastAction === item.action }"
        :disabled="isRunning"
        @click="run(item.action)"
      >
        {{ t(item.label) }}
      </button>
    </div>
    <div class="ai-assist-prompt">
      <textarea
        ref="promptRef"
        v-model="instruction"
        rows="2"
        :placeholder="t('editor.ai.promptPlaceholder')"
        :disabled="isRunning"
        @keydown.enter.exact.prevent="runCustom"
      />
      <el-button
        v-if="isRunning"
        size="small"
        @click="stop"
      >
        {{ t('editor.ai.stop') }}
      </el-button>
      <el-button
        v-else
        type="primary"
        size="small"
        :disabled="!instruction.trim()"
        @click="runCustom"
      >
        {{ t('editor.ai.run') }}
      </el-button>
    </div>
    <div
      v-if="output || isRunning"
      class="ai-assist-output"
      aria-live="polite"
    >
      {{ output || t('editor.ai.generating') }}
    </div>
    <div
      v-if="errorText"
      class="ai-assist-error"
      role="alert"
    >
      {{ errorText }}
    </div>
    <div
      v-if="status === 'done'"
      class="ai-assist-footer"
    >
      <el-button
        type="primary"
        size="small"
        @click="apply('replace')"
      >
        {{ t('editor.ai.replace') }}
      </el-button>
      <el-button
        size="small"
        @click="apply('after')"
      >
        {{ t('editor.ai.insertBelow') }}
      </el-button>
      <el-button
        size="small"
        @click="copy"
      >
        {{ t('editor.ai.copy') }}
      </el-button>
      <el-button
        size="small"
        @click="retry"
      >
        {{ t('editor.ai.retry') }}
      </el-button>
      <el-button
        size="small"
        text
        @click="close"
      >
        {{ t('editor.ai.discard') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import notice from '@/services/notification'
import { usePreferencesStore } from '@/store/preferences'
import type { AiAction } from '@shared/types/ai'
import { AI_ASSIST_OPEN, type AiAssistOpenPayload, type AiAssistTarget, type AiPlacement } from './target'

const PANEL_WIDTH = 460
const VIEWPORT_MARGIN = 16
// Below this much room under the selection the panel opens above it instead.
const MIN_SPACE_BELOW = 260

const presetActions: Array<{ action: AiAction; label: string }> = [
  { action: 'refine', label: 'contextMenu.ai.refine' },
  { action: 'fix-grammar', label: 'contextMenu.ai.fixGrammar' },
  { action: 'shorter', label: 'contextMenu.ai.shorter' },
  { action: 'longer', label: 'contextMenu.ai.longer' }
]

const { t } = useI18n()
const { aiEnabled } = storeToRefs(usePreferencesStore())

const target = ref<AiAssistTarget | null>(null)
const instruction = ref('')
const output = ref('')
const errorText = ref('')
const status = ref<'idle' | 'running' | 'done'>('idle')
const lastAction = ref<AiAction | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const promptRef = ref<HTMLTextAreaElement | null>(null)
// Id of the request whose deltas and result are still wanted; null when none is.
let activeRequestId: string | null = null
let removeDeltaListener: (() => void) | null = null

const isRunning = computed(() => status.value === 'running')

const panelStyle = computed(() => {
  const rect = target.value?.rect
  const maxLeft = window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN
  if (!rect) {
    return { top: '72px', left: `${Math.max(VIEWPORT_MARGIN, maxLeft / 2)}px`, width: `${PANEL_WIDTH}px` }
  }
  const left = `${Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft))}px`
  if (window.innerHeight - rect.bottom < MIN_SPACE_BELOW) {
    return { bottom: `${window.innerHeight - rect.top + 8}px`, left, width: `${PANEL_WIDTH}px` }
  }
  return { top: `${rect.bottom + 8}px`, left, width: `${PANEL_WIDTH}px` }
})

const cancelActiveRequest = (): void => {
  if (activeRequestId) window.electron.ipcRenderer.send('mt::ai::cancel', activeRequestId)
  activeRequestId = null
}

const run = async(action: AiAction): Promise<void> => {
  const current = target.value
  if (!current) return
  cancelActiveRequest()
  const requestId = crypto.randomUUID()
  activeRequestId = requestId
  lastAction.value = action
  output.value = ''
  errorText.value = ''
  status.value = 'running'

  const result = await window.electron.ipcRenderer.invoke('mt::ai::run', requestId, {
    action,
    text: current.text,
    instruction: instruction.value
  })
  if (activeRequestId !== requestId) return
  activeRequestId = null

  if (result.ok) {
    output.value = result.text
    status.value = 'done'
    return
  }
  status.value = 'idle'
  if (result.reason === 'missing-api-key') {
    errorText.value = t('editor.ai.missingApiKey')
  } else if (result.reason === 'failed') {
    errorText.value = t('editor.ai.failed', { message: result.message })
  }
}

const runCustom = (): void => {
  if (instruction.value.trim() && !isRunning.value) void run('custom')
}

const retry = (): void => {
  if (lastAction.value) void run(lastAction.value)
}

const stop = (): void => {
  cancelActiveRequest()
  status.value = output.value ? 'done' : 'idle'
}

const close = (): void => {
  cancelActiveRequest()
  target.value?.focus()
  target.value = null
  instruction.value = ''
  output.value = ''
  errorText.value = ''
  status.value = 'idle'
  lastAction.value = null
}

const apply = async(placement: AiPlacement): Promise<void> => {
  const current = target.value
  if (!current) return
  try {
    await current.apply(output.value, placement)
    close()
  } catch (error) {
    errorText.value = t('editor.ai.failed', {
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

const copy = async(): Promise<void> => {
  await window.electron.clipboard.writeText(output.value)
  close()
}

const open = async(payload: unknown): Promise<void> => {
  const { action, target: nextTarget } = payload as AiAssistOpenPayload
  if (!aiEnabled.value) {
    void notice.notify({ title: t('contextMenu.ai.title'), message: t('editor.ai.disabled'), type: 'warning' })
    return
  }
  cancelActiveRequest()
  target.value = nextTarget
  instruction.value = ''
  output.value = ''
  errorText.value = ''
  status.value = 'idle'
  lastAction.value = null
  await nextTick()
  if (action === 'custom') {
    promptRef.value?.focus()
  } else {
    panelRef.value?.focus()
    void run(action)
  }
}

// A click elsewhere dismisses the panel only while no answer is pending, so a
// stray click cannot throw away a finished result.
const handlePointerDown = (event: PointerEvent): void => {
  if (!target.value || status.value !== 'idle') return
  if (panelRef.value && !panelRef.value.contains(event.target as Node)) close()
}

onMounted(() => {
  bus.on(AI_ASSIST_OPEN, open)
  document.addEventListener('pointerdown', handlePointerDown, true)
  removeDeltaListener = window.electron.ipcRenderer.on('mt::ai::delta', (_event, requestId, delta) => {
    if (requestId === activeRequestId) output.value += delta
  })
})

onBeforeUnmount(() => {
  cancelActiveRequest()
  bus.off(AI_ASSIST_OPEN, open)
  document.removeEventListener('pointerdown', handlePointerDown, true)
  removeDeltaListener?.()
})
</script>

<style scoped>
.ai-assist {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--editorColor);
  background: var(--floatBgColor);
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
  box-shadow: var(--floatShadow);
  outline: none;
}

.ai-assist-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-chip {
  padding: 3px 10px;
  font-size: 12px;
  color: inherit;
  background: transparent;
  border: 1px solid var(--floatBorderColor);
  border-radius: 12px;
  cursor: pointer;
}

.ai-chip:hover:not(:disabled),
.ai-chip.active {
  background: var(--floatHoverColor);
}

.ai-chip:disabled {
  opacity: 0.5;
  cursor: default;
}

.ai-assist-prompt {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.ai-assist-prompt textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: var(--inputBgColor);
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  outline: none;
}

.ai-assist-prompt textarea:focus {
  border-color: var(--themeColor);
}

.ai-assist-output {
  max-height: 40vh;
  overflow-y: auto;
  padding: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--inputBgColor);
  border-radius: 6px;
}

.ai-assist-error {
  font-size: 12px;
  color: var(--notificationErrorColor);
}

.ai-assist-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-assist-footer .el-button + .el-button {
  margin-left: 0;
}
</style>
