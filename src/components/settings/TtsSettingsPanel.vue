<template>
  <FluentCard class="settings-section">
    <h3 class="section-title">
      <FluentIcon icon="megaphone-24-regular" :width="20" />
      {{ lang === 'en' ? 'Voice announcement' : '语音播报' }}
    </h3>

    <div class="setting-row">
      <div class="setting-label-group">
        <span class="setting-label">{{ lang === 'en' ? 'Read the result aloud' : '点名结果语音播报' }}</span>
        <span class="setting-desc">
          {{ lang === 'en'
            ? 'After each draw, synthesize the picked names with the selected voice.'
            : '每次点名结束后，用选定的语音服务把抽中的名字读出来。' }}
        </span>
      </div>
      <FluentToggle
        :model-value="settings.ttsEnabled"
        :aria-label="lang === 'en' ? 'Voice announcement' : '语音播报'"
        @update:model-value="update('ttsEnabled', $event)"
      />
    </div>

    <Transition name="toggle-expand">
      <div v-if="settings.ttsEnabled" class="sub-setting tts-body">
        <div class="setting-row">
          <span class="setting-label">{{ lang === 'en' ? 'Provider' : '语音服务' }}</span>
          <FluentSelect
            :model-value="settings.ttsProvider"
            :options="providerOptions"
            width="240px"
            @update:model-value="onProviderChange"
          />
        </div>

        <div class="provider-note">
          <div class="provider-note-text">
            <strong>{{ currentProvider.name }}</strong>
            <span>{{ currentProvider.description[lang === 'en' ? 'en' : 'zh'] }}</span>
          </div>
          <FluentButton variant="subtle" size="sm" @click="openExternal(currentProvider.doc)">
            {{ lang === 'en' ? 'Docs' : '接口文档' }}
          </FluentButton>
        </div>

        <!-- Edge TTS -->
        <template v-if="settings.ttsProvider === 'edge'">
          <div class="setting-row">
            <span class="setting-label">{{ lang === 'en' ? 'Voice' : '音色' }}</span>
            <FluentSelect
              :model-value="settings.ttsEdgeVoice"
              :options="EDGE_VOICES"
              width="260px"
              @update:model-value="update('ttsEdgeVoice', $event)"
            />
          </div>
          <p class="tts-hint">{{ lang === 'en' ? 'Free, no key needed. If nothing plays, the network may be blocking the Edge speech endpoint.' : '免费且无需密钥。若完全没有声音，可能是网络无法连接到 Edge 语音服务。' }}</p>
        </template>

        <!-- Qwen TTS -->
        <template v-else-if="settings.ttsProvider === 'qwen'">
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">DashScope API Key</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Kept in the local encrypted store.' : '保存在本地加密存储中，不会上传。' }}</span>
            </div>
            <FluentInput
              :model-value="drafts.qwenKey"
              type="password"
              class="tts-secret-input"
              placeholder="sk-..."
              @update:model-value="drafts.qwenKey = $event"
              @enter="commitKey('qwen')"
              @blur="commitKey('qwen')"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">{{ lang === 'en' ? 'Model' : '模型' }}</span>
            <FluentSelect :model-value="settings.ttsQwenModel" :options="QWEN_MODELS" width="220px" @update:model-value="update('ttsQwenModel', $event)" />
          </div>
          <div class="setting-row">
            <span class="setting-label">{{ lang === 'en' ? 'Voice' : '音色' }}</span>
            <FluentSelect :model-value="settings.ttsQwenVoice" :options="QWEN_VOICES" width="260px" @update:model-value="update('ttsQwenVoice', $event)" />
          </div>
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Custom voice id' : '自定义音色' }}</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Filled in, it overrides the list above.' : '填写后优先使用这里的音色名。' }}</span>
            </div>
            <FluentInput
              :model-value="drafts.qwenVoice"
              class="tts-text-input"
              :placeholder="lang === 'en' ? 'e.g. Cherry' : '例如 Cherry'"
              @update:model-value="drafts.qwenVoice = $event"
              @enter="commitKey('qwenVoice')"
              @blur="commitKey('qwenVoice')"
            />
          </div>
        </template>

        <!-- CosyVoice -->
        <template v-else-if="settings.ttsProvider === 'cosyvoice'">
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">DashScope API Key</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Kept in the local encrypted store.' : '保存在本地加密存储中，不会上传。' }}</span>
            </div>
            <FluentInput
              :model-value="drafts.cosyKey"
              type="password"
              class="tts-secret-input"
              placeholder="sk-..."
              @update:model-value="drafts.cosyKey = $event"
              @enter="commitKey('cosy')"
              @blur="commitKey('cosy')"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">{{ lang === 'en' ? 'Model' : '模型' }}</span>
            <FluentSelect :model-value="settings.ttsCosyModel" :options="COSY_MODELS" width="220px" @update:model-value="update('ttsCosyModel', $event)" />
          </div>
          <div class="setting-row">
            <span class="setting-label">{{ lang === 'en' ? 'Voice' : '音色' }}</span>
            <FluentSelect :model-value="settings.ttsCosyVoice" :options="COSY_VOICES" width="280px" @update:model-value="update('ttsCosyVoice', $event)" />
          </div>
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Cloned voice id' : '克隆音色编号' }}</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Use the voice id generated by CosyVoice cloning.' : '填入 CosyVoice 声音复刻后得到的声音编号，填写后优先。' }}</span>
            </div>
            <FluentInput
              :model-value="drafts.cosyVoice"
              class="tts-text-input"
              placeholder="cosyvoice-clone-..."
              @update:model-value="drafts.cosyVoice = $event"
              @enter="commitKey('cosyVoice')"
              @blur="commitKey('cosyVoice')"
            />
          </div>
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Endpoint base' : '接口地址' }}</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Use your workspace host for cosyvoice-v3.' : '使用 cosyvoice-v3 时填业务空间专属域名。' }}</span>
            </div>
            <FluentInput
              :model-value="drafts.cosyBase"
              class="tts-text-input"
              placeholder="https://dashscope.aliyuncs.com"
              @update:model-value="drafts.cosyBase = $event"
              @enter="commitKey('cosyBase')"
              @blur="commitKey('cosyBase')"
            />
          </div>
        </template>

        <!-- MiMo -->
        <template v-else-if="settings.ttsProvider === 'mimo'">
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">MiMo API Key</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Kept in the local encrypted store.' : '保存在本地加密存储中，不会上传。' }}</span>
            </div>
            <FluentInput
              :model-value="drafts.mimoKey"
              type="password"
              class="tts-secret-input"
              placeholder="sk-..."
              @update:model-value="drafts.mimoKey = $event"
              @enter="commitKey('mimo')"
              @blur="commitKey('mimo')"
            />
          </div>
          <div class="setting-row">
            <span class="setting-label">{{ lang === 'en' ? 'Voice mode' : '音色模式' }}</span>
            <FluentSelect :model-value="settings.ttsMimoMode" :options="mimoModeOptions" width="220px" @update:model-value="update('ttsMimoMode', $event)" />
          </div>
          <div v-if="settings.ttsMimoMode === 'preset'" class="setting-row">
            <span class="setting-label">{{ lang === 'en' ? 'Voice' : '预置音色' }}</span>
            <FluentSelect :model-value="settings.ttsMimoVoice" :options="MIMO_VOICES" width="240px" @update:model-value="update('ttsMimoVoice', $event)" />
          </div>
          <div v-else class="clone-block">
            <div class="setting-row">
              <div class="setting-label-group">
                <span class="setting-label">{{ lang === 'en' ? 'Clone sample' : '克隆样本' }}</span>
                <span class="setting-desc">{{ sampleName || (lang === 'en' ? 'mp3 or wav, 10–30 seconds works best' : '支持 mp3 / wav，10–30 秒清晰人声效果最好') }}</span>
              </div>
              <div class="clone-actions">
                <FluentButton variant="secondary" size="sm" @click="pickSample">{{ lang === 'en' ? 'Choose audio' : '选择音频' }}</FluentButton>
                <FluentButton v-if="sampleName" variant="subtle" size="sm" @click="clearSample">{{ lang === 'en' ? 'Remove' : '移除' }}</FluentButton>
              </div>
            </div>
            <input ref="fileInput" class="hidden-file" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" @change="onFilePicked" />
          </div>
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Style prompt' : '风格指令' }}</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Optional, e.g. warm and slow, like telling a story.' : '可选，例如「温和、稍慢，像在讲故事」。' }}</span>
            </div>
            <FluentInput
              :model-value="drafts.mimoStyle"
              class="tts-text-input"
              @update:model-value="drafts.mimoStyle = $event"
              @enter="commitKey('mimoStyle')"
              @blur="commitKey('mimoStyle')"
            />
          </div>
        </template>

        <div class="setting-row">
          <div class="setting-label-group">
            <span class="setting-label">{{ lang === 'en' ? 'Speed' : '语速' }}</span>
            <span class="setting-desc">{{ lang === 'en' ? 'Only Edge TTS applies it; others follow the voice itself.' : '目前仅 Edge TTS 生效，其他服务以音色自带的节奏为准。' }}</span>
          </div>
          <div class="slider-row">
            <FluentSlider
              :model-value="settings.ttsRate"
              :min="-50"
              :max="100"
              :step="5"
              class="tts-slider"
              :show-value="false"
              :aria-label="lang === 'en' ? 'Speech speed' : '语速'"
              @update:model-value="update('ttsRate', $event)"
            />
            <span class="slider-value">{{ settings.ttsRate > 0 ? '+' : '' }}{{ settings.ttsRate }}%</span>
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">{{ lang === 'en' ? 'Volume' : '音量' }}</span>
          <div class="slider-row">
            <FluentSlider
              :model-value="settings.ttsVolume"
              :min="0"
              :max="100"
              :step="5"
              class="tts-slider"
              :show-value="false"
              :aria-label="lang === 'en' ? 'Volume' : '音量'"
              @update:model-value="update('ttsVolume', $event)"
            />
            <span class="slider-value">{{ settings.ttsVolume }}%</span>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label-group">
            <span class="setting-label">{{ lang === 'en' ? 'Announcement template' : '播报模板' }}</span>
            <span class="setting-desc">{{ lang === 'en' ? '{names} is replaced by the picked names.' : '{names} 会被替换成抽中的姓名，多人时用顿号连接。' }}</span>
          </div>
          <FluentInput
            :model-value="drafts.template"
            class="tts-text-input"
            :maxlength="60"
            @update:model-value="drafts.template = $event"
            @enter="commitKey('template')"
            @blur="commitKey('template')"
          />
        </div>

        <div class="preview-row">
          <div class="preview-info">
            <span class="preview-text">{{ previewText }}</span>
            <span v-if="statusText" :class="['preview-status', { error: ttsService.state.status === 'error' }]">{{ statusText }}</span>
          </div>
          <div class="preview-actions">
            <FluentButton variant="secondary" size="sm" :disabled="ttsService.state.status === 'synthesizing'" @click="preview">
              <FluentIcon icon="play-16-regular" :width="14" />
              {{ lang === 'en' ? 'Preview' : '试听' }}
            </FluentButton>
            <FluentButton v-if="ttsService.state.status !== 'idle'" variant="subtle" size="sm" @click="ttsService.stop()">
              {{ lang === 'en' ? 'Stop' : '停止' }}
            </FluentButton>
          </div>
        </div>
      </div>
    </Transition>
  </FluentCard>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useNamesStore } from '../../stores/names'
import { isTauri, tauriAPI } from '../../utils/tauriAPI'
import { openExternal } from '../../utils/openExternal'
import { ttsService } from '../../utils/tts/service'
import {
  COSY_MODELS,
  COSY_VOICES,
  EDGE_VOICES,
  MIMO_VOICES,
  QWEN_MODELS,
  QWEN_VOICES,
  TTS_PROVIDERS,
  buildAnnouncementText,
  providerMeta
} from '../../utils/tts/catalog'

const settingsStore = useSettingsStore()
const namesStore = useNamesStore()
const settings = computed(() => settingsStore.settings)
const lang = computed(() => settingsStore.settings.language)

const update = (key, value) => settingsStore.update(key, value)

const providerOptions = TTS_PROVIDERS.map(provider => ({ value: provider.id, label: provider.name }))
const currentProvider = computed(() => providerMeta(settings.value.ttsProvider))
const mimoModeOptions = computed(() => [
  { value: 'preset', label: lang.value === 'en' ? 'Preset voices' : '预置音色' },
  { value: 'clone', label: lang.value === 'en' ? 'Voice cloning' : '音色克隆' }
])

const drafts = reactive({
  qwenKey: settings.value.ttsQwenApiKey || '',
  qwenVoice: settings.value.ttsQwenCustomVoice || '',
  cosyKey: settings.value.ttsCosyApiKey || '',
  cosyVoice: settings.value.ttsCosyCustomVoice || '',
  cosyBase: settings.value.ttsCosyBaseUrl || '',
  mimoKey: settings.value.ttsMimoApiKey || '',
  mimoStyle: settings.value.ttsMimoStyle || '',
  template: settings.value.ttsTemplate || ''
})
const sampleName = ref('')
watch(() => settings.value.ttsProvider, () => { ttsService.stop() })

const draftMap = {
  qwen: ['qwenKey', 'ttsQwenApiKey'],
  qwenVoice: ['qwenVoice', 'ttsQwenCustomVoice'],
  cosy: ['cosyKey', 'ttsCosyApiKey'],
  cosyVoice: ['cosyVoice', 'ttsCosyCustomVoice'],
  cosyBase: ['cosyBase', 'ttsCosyBaseUrl'],
  mimo: ['mimoKey', 'ttsMimoApiKey'],
  mimoStyle: ['mimoStyle', 'ttsMimoStyle'],
  template: ['template', 'ttsTemplate']
}

function commitKey(name) {
  const entry = draftMap[name]
  if (!entry) return
  const [draftKey, settingKey] = entry
  const value = String(drafts[draftKey] ?? '').trim()
  drafts[draftKey] = value
  if (settings.value[settingKey] !== value) settingsStore.update(settingKey, value)
  ttsService.clearCache()
}

function onProviderChange(value) {
  ttsService.stop()
  update('ttsProvider', value)
}

const previewText = computed(() => {
  const picks = (namesStore.currentNames || []).slice(0, 2).map(person => person.cn).filter(Boolean)
  const names = picks.length ? picks : [lang.value === 'en' ? 'Alex' : '张三']
  return buildAnnouncementText(settings.value.ttsTemplate, names)
})

const statusText = computed(() => {
  const status = ttsService.state.status
  if (status === 'synthesizing') return lang.value === 'en' ? 'Synthesizing…' : '正在合成…'
  if (status === 'playing') return lang.value === 'en' ? 'Playing…' : '正在播放…'
  if (status === 'error') return ttsService.state.error
  return ''
})

async function preview() {
  commitKey('template')
  commitKey('qwen')
  commitKey('qwenVoice')
  commitKey('cosy')
  commitKey('cosyVoice')
  commitKey('cosyBase')
  commitKey('mimo')
  commitKey('mimoStyle')
  await ttsService.preview(previewText.value, settings.value).catch(() => {})
}

const fileInput = ref(null)

async function loadSampleMeta() {
  const sample = await ttsService.loadSample()
  sampleName.value = sample?.name || ''
}

loadSampleMeta()

async function pickSample() {
  if (!isTauri()) {
    fileInput.value?.click()
    return
  }
  try {
    const picked = await tauriAPI.pluginSelectFile(['mp3', 'wav'])
    if (!picked?.success || picked.cancelled) return
    await applySample(picked)
  } catch (error) {
    ttsService.state.status = 'error'
    ttsService.state.error = error?.message || String(error)
  }
}

async function onFilePicked(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    ttsService.state.status = 'error'
    ttsService.state.error = lang.value === 'en' ? 'Sample must be under 8 MB' : '样本文件不能超过 8 MB'
    return
  }
  const buffer = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < buffer.length; index += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(index, index + 0x8000))
  }
  await applySample({ name: file.name, base64: btoa(binary) })
}

async function applySample(picked) {
  const name = picked.name || 'sample.mp3'
  if (picked.size && picked.size > 8 * 1024 * 1024) {
    ttsService.state.status = 'error'
    ttsService.state.error = lang.value === 'en' ? 'Sample must be under 8 MB' : '样本文件不能超过 8 MB'
    return
  }
  if (!picked.base64) return
  const mime = /\.wav$/i.test(name) ? 'audio/wav' : 'audio/mpeg'
  await ttsService.saveSample({ name, mime, base64: picked.base64 })
  sampleName.value = name
  ttsService.clearCache()
}

async function clearSample() {
  await ttsService.saveSample(null)
  sampleName.value = ''
  ttsService.clearCache()
}
</script>

<style scoped>
.settings-section { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; gap: 16px; }
.setting-label { font-size: 14px; color: var(--text-secondary); }
.setting-label-group { display: flex; flex-direction: column; gap: 2px; }
.setting-desc { font-size: 12px; color: var(--text-muted); }
.sub-setting { padding-left: 16px; border-left: 2px solid var(--accent-200); margin-left: 0; }
.tts-body { display: flex; flex-direction: column; }
.provider-note {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 4px 0 8px; padding: 10px 12px; border-radius: var(--radius-sm);
  background: var(--bg-subtle); border: 1px solid var(--border-subtle);
}
.provider-note-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.provider-note-text strong { font-size: 13px; color: var(--text-primary); }
.provider-note-text span { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.tts-hint { margin: 2px 0 6px; font-size: 12px; color: var(--text-muted); line-height: 1.55; }
.tts-secret-input { width: 260px; }
.tts-text-input { width: 260px; }
.slider-row { display: flex; align-items: center; gap: 10px; width: 260px; }
.tts-slider { flex: 1; min-width: 0; }
.slider-value { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 44px; text-align: right; }
.clone-block { padding: 4px 0; }
.clone-actions { display: flex; align-items: center; gap: 8px; }
.hidden-file { display: none; }
.preview-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-default);
}
.preview-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.preview-text { font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-status { font-size: 12px; color: var(--text-muted); }
.preview-status.error { color: var(--danger, #c42b1c); }
.preview-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.toggle-expand-enter-active { animation: tts-toggle-in 0.25s cubic-bezier(0.1, 0.9, 0.2, 1); }
.toggle-expand-leave-active { animation: tts-toggle-in 0.15s ease-in reverse; }
@keyframes tts-toggle-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 760px) {
  .setting-row { align-items: stretch; flex-direction: column; gap: 8px; }
  .setting-row:has(> .fluent-toggle) { align-items: center; flex-direction: row; }
  .tts-secret-input, .tts-text-input, .slider-row { width: 100%; }
}
</style>
