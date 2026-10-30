<template>
  <div class="pref-ai">
    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.ai.title') }}
        </h6>
      </template>
      <template #children>
        <bool
          id="setting-aiEnabled"
          :description="preferenceLabel('aiEnabled')"
          :notes="preferenceNotes('aiEnabled')"
          :bool="aiEnabled"
          :on-change="(value) => onChange('aiEnabled', value)"
        />
        <text-box
          id="setting-aiModel"
          :description="preferenceLabel('aiModel')"
          :notes="preferenceNotes('aiModel')"
          :input="aiModel"
          default-value="gpt-4.1-mini"
          :disable="!aiEnabled"
          :validate="(value) => value.trim().length > 0"
          :on-change="(value) => onChange('aiModel', value.trim())"
        />
        <text-box
          id="setting-aiBaseUrl"
          :description="preferenceLabel('aiBaseUrl')"
          :notes="preferenceNotes('aiBaseUrl')"
          :input="aiBaseUrl"
          default-value="https://api.openai.com/v1"
          :disable="!aiEnabled"
          :on-change="(value) => onChange('aiBaseUrl', value.trim())"
        />
        <setting-row
          id="setting-aiApiKey"
          :description="preferenceLabel('aiApiKey')"
          :notes="`${preferenceNotes('aiApiKey')} ${hasApiKey ? t('preferences.ai.apiKeySet') : t('preferences.ai.apiKeyMissing')}`"
          :disabled="!aiEnabled"
          wide
        >
          <template #default="{ descriptionId }">
            <div class="api-key-row">
              <el-input
                v-model="apiKeyInput"
                type="password"
                show-password
                autocomplete="off"
                :aria-label="preferenceLabel('aiApiKey')"
                :aria-describedby="descriptionId"
                :disabled="!aiEnabled"
                placeholder="sk-..."
                @keydown.enter="saveApiKey"
              />
              <el-button
                type="primary"
                :disabled="!aiEnabled || !apiKeyInput.trim()"
                @click="saveApiKey"
              >
                {{ t('preferences.ai.save') }}
              </el-button>
              <el-button
                v-if="hasApiKey"
                :disabled="!aiEnabled"
                @click="removeApiKey"
              >
                {{ t('preferences.ai.remove') }}
              </el-button>
            </div>
          </template>
        </setting-row>
      </template>
    </compound>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import notice from '@/services/notification'
import { usePreferencesStore, type PreferencesState } from '@/store/preferences'
import { preferenceLabel, preferenceNotes } from '@/prefComponents/registry'
import Compound from '../common/compound/index.vue'
import Bool from '../common/bool/index.vue'
import TextBox from '../common/textBox/index.vue'
import SettingRow from '../common/settingRow.vue'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()
const { aiEnabled, aiModel, aiBaseUrl } = storeToRefs(preferenceStore)

const hasApiKey = ref(false)
const apiKeyInput = ref('')

const onChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

const writeApiKey = async(apiKey: string): Promise<void> => {
  try {
    await window.electron.ipcRenderer.invoke('mt::ai::set-api-key', apiKey)
    apiKeyInput.value = ''
  } catch (error) {
    void notice.notify({
      title: t('preferences.ai.title'),
      message: t('preferences.ai.saveFailed', {
        message: error instanceof Error ? error.message : String(error)
      }),
      type: 'error'
    })
  }
  hasApiKey.value = await window.electron.ipcRenderer.invoke('mt::ai::has-api-key')
}

const saveApiKey = (): void => {
  if (apiKeyInput.value.trim()) void writeApiKey(apiKeyInput.value)
}

const removeApiKey = (): void => {
  void writeApiKey('')
}

onMounted(async() => {
  hasApiKey.value = await window.electron.ipcRenderer.invoke('mt::ai::has-api-key')
})
</script>

<style scoped>
.api-key-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.api-key-row .el-button + .el-button {
  margin-left: 0;
}
</style>
