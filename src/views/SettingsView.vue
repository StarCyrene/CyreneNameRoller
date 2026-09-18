<template>
  <div class="settings-view">
    <h1 class="page-title">
      <FluentIcon icon="settings-24-regular" :width="28" />
      {{ t('settings', lang) }}
    </h1>

    <!-- 基本设置 -->
    <FluentCard v-if="section === 'general'" class="settings-section">
      <h3 class="section-title"><FluentIcon icon="options-24-regular" :width="20" /> {{ lang === 'en' ? 'General' : '基本设置' }}</h3>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Language' : '语言' }}</span>
        <FluentSelect :model-value="settings.language" :options="langOptions" width="200px" @update:model-value="update('language', $event)" />
      </div>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ t('startupSplash', lang) }}</span>
        </div>
        <FluentToggle
          :model-value="!settings.disableSplash"
          :aria-label="lang === 'en' ? 'Startup splash screen' : '启动欢迎屏'"
          @update:model-value="update('disableSplash', !$event)"
        />
      </div>
      <div v-if="isDesktop" class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Update download source' : '更新下载源' }}</span>
        <FluentSelect :model-value="settings.downloadSource" :options="downloadSourceOptions" width="220px" @update:model-value="update('downloadSource', $event)" />
      </div>
      <div v-if="isDesktop" class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Floating Window' : '悬浮窗快捷点名' }}</span>
        <FluentToggle :model-value="settings.floatingWindowEnabled" :aria-label="lang === 'en' ? 'Floating window' : '悬浮窗'" @update:model-value="onFloatingWindowToggle" />
      </div>
      <Transition name="toggle-expand">
        <div v-if="isDesktop && settings.floatingWindowEnabled" class="sub-setting floating-window-settings">
          <div class="floating-style-setting">
            <span class="setting-label">{{ lang === 'en' ? 'Floating window style' : '悬浮窗样式' }}</span>
            <div class="floating-style-options" role="radiogroup" :aria-label="lang === 'en' ? 'Floating window style' : '悬浮窗样式'">
              <label
                v-for="option in floatingStyleOptions"
                :key="option.value"
                :class="['floating-style-option', { selected: settings.floatingWindowStyle === option.value }]"
              >
                <input
                  class="floating-style-radio"
                  type="radio"
                  name="floating-window-style"
                  :value="option.value"
                  :checked="settings.floatingWindowStyle === option.value"
                  @change="onFloatingWindowStyleChange(option.value)"
                />
                <span
                  :class="['floating-style-preview', { 'text-preview': option.value === 'text' }]"
                  :style="{
                    borderRadius: `${resolveFloatingWindowRadius(settings.floatingWindowRadius, option.value)}%`,
                    opacity: floatingOpacityDraft / 100,
                    background: option.value === 'text' ? settings.floatingWindowBackgroundColor : undefined,
                    color: option.value === 'text' ? settings.floatingWindowTextColor : undefined,
                    fontSize: option.value === 'text' ? `${floatingWindowTextSize(52, floatingTextPreview, settings.floatingWindowTextSize)}px` : undefined
                  }"
                >
                  <span v-if="option.value === 'text'">{{ floatingTextPreview }}</span>
                  <FluentIcon v-else-if="option.value === 'custom' && !settings.floatingWindowCustomImage" icon="image-add-24-regular" :width="24" />
                  <img v-else :src="floatingWindowImagePath(option.value, settings.floatingWindowCustomImage)" alt="" />
                </span>
                <span class="floating-style-label">{{ option.label }}</span>
              </label>
            </div>
            <div v-if="settings.floatingWindowStyle === 'text'" class="floating-text-settings">
              <div class="setting-row">
                <span class="setting-label">{{ lang === 'en' ? 'Text content' : '文字内容' }}</span>
                <FluentInput
                  :model-value="floatingTextDraft"
                  class="floating-text-input"
                  :maxlength="MAX_FLOATING_WINDOW_TEXT_LENGTH"
                  :placeholder="DEFAULT_FLOATING_WINDOW_TEXT"
                  @update:model-value="onFloatingWindowTextInput"
                  @enter="commitFloatingWindowText"
                  @blur="commitFloatingWindowText"
                />
              </div>
              <div class="setting-row floating-text-size-row">
                <div class="setting-label-group">
                  <span class="setting-label">{{ lang === 'en' ? 'Text size' : '文字大小' }}</span>
                  <span class="setting-desc">{{ floatingTextSizeDraft }} px</span>
                </div>
                <FluentSlider
                  :model-value="floatingTextSizeDraft"
                  :min="MIN_FLOATING_WINDOW_TEXT_SIZE"
                  :max="floatingTextSizeMax"
                  :step="1"
                  class="floating-text-size-range"
                  :aria-label="lang === 'en' ? 'Floating window text size' : '悬浮窗文字大小'"
                  :show-value="false"
                  @update:model-value="onFloatingWindowTextSizeInput"
                  @change="onFloatingWindowTextSizeInput"
                />
              </div>
              <div class="setting-row">
                <span class="setting-label">{{ lang === 'en' ? 'Background color' : '背景颜色' }}</span>
                <div class="color-picker-row">
                  <FluentColorPicker :model-value="settings.floatingWindowBackgroundColor" @update:model-value="onFloatingWindowBackgroundColor" />
                  <span class="color-value">{{ settings.floatingWindowBackgroundColor }}</span>
                </div>
              </div>
              <div class="setting-row">
                <span class="setting-label">{{ lang === 'en' ? 'Text color' : '文字颜色' }}</span>
                <div class="color-picker-row">
                  <FluentColorPicker :model-value="settings.floatingWindowTextColor" @update:model-value="onFloatingWindowTextColor" />
                  <span class="color-value">{{ settings.floatingWindowTextColor }}</span>
                </div>
              </div>
            </div>
            <FluentButton
              v-if="settings.floatingWindowStyle === 'custom'"
              variant="secondary"
              size="sm"
              class="floating-custom-button"
              @click="selectFloatingWindowImage"
            >
              <FluentIcon icon="crop-20-regular" :width="16" />
              {{ settings.floatingWindowCustomImage ? (lang === 'en' ? 'Replace and crop image' : '更换并裁切图片') : (lang === 'en' ? 'Choose and crop image' : '选择并裁切图片') }}
            </FluentButton>
          </div>
          <div class="setting-row floating-size-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Floating window size' : '悬浮窗大小' }}</span>
              <span class="setting-desc">{{ floatingSizeDraft }} px</span>
            </div>
            <FluentSlider
              :model-value="floatingSizeDraft"
              :min="40"
              :max="256"
              :step="4"
              class="floating-size-range"
              :aria-label="lang === 'en' ? 'Floating window size' : '悬浮窗大小'"
              :show-value="false"
              @update:model-value="onFloatingWindowSizeInput"
              @change="onFloatingWindowSizeChange"
            />
          </div>
          <div v-if="supportsFloatingRadius" class="setting-row floating-radius-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Corner radius' : '悬浮窗圆角' }}</span>
              <span class="setting-desc">{{ floatingRadiusDraft }}%</span>
            </div>
            <FluentSlider
              :model-value="floatingRadiusDraft"
              :min="0"
              :max="50"
              :step="1"
              class="floating-radius-range"
              :aria-label="lang === 'en' ? 'Floating window corner radius' : '悬浮窗圆角'"
              :show-value="false"
              @update:model-value="onFloatingWindowRadiusInput"
              @change="onFloatingWindowRadiusChange"
            />
          </div>
          <div class="setting-row floating-opacity-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Opacity' : '悬浮窗透明度' }}</span>
              <span class="setting-desc">{{ floatingOpacityDraft }}%</span>
            </div>
            <FluentSlider
              :model-value="floatingOpacityDraft"
              :min="MIN_FLOATING_WINDOW_OPACITY"
              :max="MAX_FLOATING_WINDOW_OPACITY"
              :step="1"
              class="floating-opacity-range"
              :aria-label="lang === 'en' ? 'Floating window opacity' : '悬浮窗透明度'"
              :show-value="false"
              @update:model-value="onFloatingWindowOpacityInput"
              @change="onFloatingWindowOpacityInput"
            />
          </div>
          <div class="setting-row floating-reset-row">
            <span class="setting-label">{{ lang === 'en' ? 'Floating window position' : '悬浮窗位置' }}</span>
            <FluentButton variant="secondary" size="sm" @click="resetFloatingWindowPosition">
              <FluentIcon icon="arrow-reset-20-regular" :width="16" />
              {{ lang === 'en' ? 'Reset position' : '重置位置' }}
            </FluentButton>
          </div>
        </div>
      </Transition>
      <div v-if="isTauri()" class="setting-row"><span class="setting-label">{{ lang === 'en' ? 'Launch at sign-in' : '开机自启动' }}</span><FluentToggle :model-value="settings.autoStart" :aria-label="lang === 'en' ? 'Launch at sign-in' : '开机自启动'" :disabled="autoStartBusy" @update:model-value="onAutoStart" /></div>
      <Transition name="toggle-expand">
        <div v-if="isTauri() && settings.autoStart" class="sub-setting">
          <div v-if="isWindows" class="setting-row"><span class="setting-label">{{ lang === 'en' ? 'Startup method' : '启动方式' }}</span><FluentSelect :model-value="settings.autoStartMode" :options="autoStartModeOptions" width="240px" :disabled="autoStartBusy" @update:model-value="onAutoStartModeChange" /></div>
          <div class="setting-row"><span class="setting-label">{{ lang === 'en' ? 'Start hidden in tray' : '启动到托盘' }}</span><FluentToggle :model-value="settings.autoStartToTray" :aria-label="lang === 'en' ? 'Start hidden in tray' : '启动到托盘'" @update:model-value="update('autoStartToTray', $event)" /></div>
        </div>
      </Transition>
      <div class="setting-row uri-setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ isTauri() ? (lang === 'en' ? 'Cyrene URI protocol' : 'Cyrene URI 协议') : (lang === 'en' ? 'One-time URL parameters' : 'URL 一次性参数') }}</span>
          <span class="setting-desc">{{ isTauri() ? (lang === 'en' ? 'Open the app or navigate directly from an external link' : '允许外部链接呼出程序或直接跳转页面') : (lang === 'en' ? 'Append parameters to the page URL without changing saved settings' : '在页面 URL 后追加参数，不修改已保存设置') }}</span>
        </div>
        <div class="uri-setting-actions">
          <FluentButton variant="secondary" size="sm" @click="showUriHelp = true">
            <FluentIcon icon="book-open-16-regular" :width="14" />
            {{ lang === 'en' ? 'Usage guide' : '查看调用方式' }}
          </FluentButton>
          <FluentToggle v-if="isTauri()" :model-value="settings.uriSchemeEnabled" :aria-label="lang === 'en' ? 'Cyrene URI protocol' : 'Cyrene URI 协议'" :disabled="uriSchemeBusy" @update:model-value="onUriSchemeToggle" />
        </div>
      </div>
      <div v-if="isDesktop" class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Check for Updates' : '检查更新' }}</span>
        <div class="update-actions">
          <FluentButton variant="secondary" size="sm" :disabled="updateState.checking || updateState.downloading" @click="doForceUpdate">
            <FluentIcon icon="arrow-download-16-regular" :width="14" />
            {{ lang === 'en' ? 'Force Update' : '强制更新' }}
          </FluentButton>
          <FluentButton variant="primary" size="sm" :disabled="updateState.checking || updateState.downloading" @click="doCheckUpdate">
            <FluentIcon icon="search-16-regular" :width="14" />
            {{ updateState.checking ? (lang === 'en' ? 'Checking...' : '检查中...') : (lang === 'en' ? 'Check' : '检查') }}
          </FluentButton>
        </div>
      </div>
      <div v-if="isDesktop && updateState.available" class="update-info">
        <div class="update-info-content">
          <FluentIcon icon="arrow-download-16-regular" :width="16" />
          <div class="update-text">
            <span class="update-version">{{ lang === 'en' ? 'New version available' : '发现新版本' }}</span>
            <span class="update-version-num">{{ updateState.version }}{{ updateState.fileSize ? ` (${(updateState.fileSize / 1024 / 1024).toFixed(1)} MB)` : '' }}</span>
          </div>
        </div>
        <FluentButton variant="primary" size="sm" :disabled="updateState.downloading" @click="downloadUpdate(showBanner)">
          <FluentIcon icon="arrow-download-16-regular" :width="14" />
          {{ updateState.downloading ? (lang === 'en' ? 'Downloading...' : '下载中...') : (lang === 'en' ? 'Download' : '下载') }}
        </FluentButton>
      </div>

    </FluentCard>

    <!-- 主题与显示 -->
    <FluentCard v-if="section === 'appearance'" class="settings-section">
      <h3 class="section-title"><FluentIcon icon="color-24-regular" :width="20" /> {{ lang === 'en' ? 'Theme & Display' : '主题与显示' }}</h3>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Dark Mode' : '深色模式' }}</span>
        <FluentToggle :model-value="settingsStore.darkMode" :aria-label="lang === 'en' ? 'Dark mode' : '深色模式'" @update:model-value="settingsStore.toggleDarkMode()" />
      </div>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Color theme' : '主题色' }}</span>
        <FluentSelect :model-value="settings.colorTheme" :options="colorThemeOptions" width="220px" @update:model-value="update('colorTheme', $event)" />
      </div>
      <div v-if="settings.colorTheme === 'custom'" class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Custom color' : '自定义颜色' }}</span>
        <div class="color-picker-row">
          <FluentColorPicker :model-value="settings.customThemeColor" @update:model-value="onCustomColorPicker" />
          <FluentInput v-model="customColorDraft" class="hex-color-input" placeholder="#0078d4 / rgb(0,120,212)" @enter="commitCustomColor" @blur="commitCustomColor" />
        </div>
      </div>
      <div class="setting-row">
        <span class="setting-label">{{ t('nameColorMode', lang) }}</span>
        <FluentSelect :model-value="settings.nameColorMode" :options="colorModeOptions" width="200px" @update:model-value="update('nameColorMode', $event)" />
      </div>
      <Transition name="toggle-expand">
        <div v-if="settings.nameColorMode === 'custom'" class="sub-setting">
          <div class="setting-row">
            <span class="setting-label">{{ t('customColorLight', lang) }}</span>
            <div class="color-picker-row">
              <FluentColorPicker :model-value="settings.customNameColorLight" @update:model-value="update('customNameColorLight', $event)" />
              <span class="color-value">{{ settings.customNameColorLight }}</span>
            </div>
          </div>
          <div class="setting-row">
            <span class="setting-label">{{ t('customColorDark', lang) }}</span>
            <div class="color-picker-row">
              <FluentColorPicker :model-value="settings.customNameColorDark" @update:model-value="update('customNameColorDark', $event)" />
              <span class="color-value">{{ settings.customNameColorDark }}</span>
            </div>
          </div>
        </div>
      </Transition>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ t('uiScale', lang) }}</span>
          <span class="scale-range">{{ lang === 'en' ? 'Range 50–200%' : '范围 50%-200%' }}</span>
        </div>
        <div class="scale-control">
          <div class="scale-input-wrap">
            <FluentNumberBox
              v-model="scaleDraft"
              :min="50"
              :max="200"
              :step="1"
              :show-spin-buttons="false"
              style="flex: 1; min-width: 0"
              aria-label="UI scale"
            />
            <span class="scale-unit">%</span>
          </div>
          <Transition name="scale-btn">
            <FluentButton v-if="scaleChanged" variant="secondary" size="sm" @click="confirmScale">{{ lang === 'en' ? 'Apply' : '确认' }}</FluentButton>
          </Transition>
        </div>
      </div>
      <div class="setting-row">
        <span class="setting-label">{{ t('fontSize', lang) }}</span>
        <FluentSelect :model-value="settings.nameFontSize" :options="fontSizeOptions" width="200px" @update:model-value="update('nameFontSize', $event)" />
      </div>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Font' : '字体' }}</span>
        <FluentSelect :model-value="settings.fontFamily" :options="fontOptions" width="200px" @update:model-value="update('fontFamily', $event)" />
      </div>
    </FluentCard>

    <!-- 性能设置 -->
    <FluentCard v-if="section === 'appearance'" class="settings-section">
      <h3 class="section-title"><FluentIcon icon="gauge-24-regular" :width="20" /> {{ lang === 'en' ? 'Performance' : '性能设置' }}</h3>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ lang === 'en' ? 'Acrylic Blur' : '亚克力模糊' }}</span>
          <span class="setting-desc">{{ lang === 'en' ? 'Glass blur on cards, dock, titlebar' : '卡片、侧边栏、标题栏的毛玻璃效果' }}</span>
        </div>
        <FluentToggle :model-value="settings.perfBlur" :aria-label="lang === 'en' ? 'Acrylic blur' : '亚克力模糊'" @update:model-value="update('perfBlur', $event)" />
      </div>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ lang === 'en' ? 'Shadows' : '阴影效果' }}</span>
          <span class="setting-desc">{{ lang === 'en' ? 'Card and button drop shadows' : '卡片和按钮的投影效果' }}</span>
        </div>
        <FluentToggle :model-value="settings.perfShadows" :aria-label="lang === 'en' ? 'Shadows' : '阴影效果'" @update:model-value="update('perfShadows', $event)" />
      </div>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ lang === 'en' ? 'Animations' : '过渡动画' }}</span>
          <span class="setting-desc">{{ lang === 'en' ? 'Page transitions, hover effects' : '页面切换动画、悬停效果' }}</span>
        </div>
        <FluentToggle :model-value="settings.perfAnimations" :aria-label="lang === 'en' ? 'Animations' : '过渡动画'" @update:model-value="update('perfAnimations', $event)" />
      </div>
      <div class="performance-note">
        <FluentIcon icon="info-16-regular" :width="14" />
        <span>{{ lang === 'en' ? 'Disable options to improve performance on integrated GPUs.' : '关闭选项可提升核显设备性能。' }}</span>
      </div>
    </FluentCard>

    <!-- 数据管理 -->
    <FluentCard v-if="section === 'data'" class="settings-section">
      <h3 class="section-title"><FluentIcon icon="database-24-regular" :width="20" /> {{ lang === 'en' ? 'Data' : '数据管理' }}</h3>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ lang === 'en' ? 'Enable Statistics' : '启用数据统计' }}</span>
          <span class="setting-desc">{{ balance.enabled
            ? (lang === 'en' ? 'Required by the fairness algorithm.' : '公平算法需要持续记录统计数据。')
            : (lang === 'en' ? 'When off, no selection counts are recorded.' : '关闭后不记录中签次数。') }}</span>
        </div>
          <FluentToggle :model-value="settings.recordCounts" :aria-label="lang === 'en' ? 'Enable statistics' : '启用数据统计'" :disabled="balance.enabled" @update:model-value="update('recordCounts', $event)" />
      </div>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ lang === 'en' ? 'New member initial count' : '新成员初始统计' }}</span>
          <span class="setting-desc">{{ lang === 'en' ? 'Choose the baseline used when adding a person.' : '选择新增人员时使用的初始次数。' }}</span>
        </div>
        <FluentSelect :model-value="settings.newMemberCountMode" :options="newMemberCountModeOptions" width="220px" @update:model-value="update('newMemberCountMode', $event)" />
      </div>
      <div v-if="isDesktop" class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ lang === 'en' ? 'Portable mode' : '便携模式' }}</span>
          <span class="setting-desc">{{ lang === 'en' ? 'Store app data beside the program instead of AppData.' : '开启后将应用数据保存在程序目录，而不是 AppData。' }}</span>
        </div>
        <FluentToggle :model-value="portableMode" :aria-label="lang === 'en' ? 'Portable mode' : '便携模式'" :disabled="portableModeBusy" @update:model-value="onPortableModeChange" />
      </div>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Data Password' : '数据操作密码' }}</span>
        <FluentButton variant="secondary" size="sm" @click="openPasswordModal">
          <FluentIcon icon="lock-closed-16-regular" :width="14" />
          {{ hasPassword ? (lang === 'en' ? 'Change' : '修改密码') : (lang === 'en' ? 'Set' : '设置密码') }}
        </FluentButton>
      </div>
      <div class="action-row">
        <FluentButton variant="secondary" :disabled="!hasPassword" @click="doExport">
          <FluentIcon icon="arrow-download-16-regular" :width="14" /> {{ lang === 'en' ? 'Export' : '导出数据' }}
        </FluentButton>
        <FluentButton variant="secondary" :disabled="!hasPassword" @click="doImport">
          <FluentIcon icon="arrow-upload-16-regular" :width="14" /> {{ lang === 'en' ? 'Import' : '导入数据' }}
        </FluentButton>
        <FluentButton variant="secondary" :disabled="!hasPassword" @click="doClearRecords">
          <FluentIcon icon="broom-16-regular" :width="14" /> {{ lang === 'en' ? 'Clear Records' : '清空记录' }}
        </FluentButton>
        <FluentButton variant="danger" :disabled="!hasPassword" @click="doClearAll">
          <FluentIcon icon="delete-16-regular" :width="14" /> {{ lang === 'en' ? 'Clear All' : '清除全部' }}
        </FluentButton>
      </div>
    </FluentCard>

    <!-- 抽取设置 -->
    <FluentCard v-if="section === 'features'" class="settings-section">
      <h3 class="section-title"><FluentIcon icon="play-24-regular" :width="18" /> {{ t('drawSettings', lang) }}</h3>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Auto stop' : '自动停止' }}</span>
        <FluentToggle :model-value="settings.autoStop" :aria-label="lang === 'en' ? 'Automatic stop' : '自动停止'" @update:model-value="update('autoStop', $event)" />
      </div>
      <Transition name="toggle-expand">
        <div v-if="settings.autoStop" class="sub-setting">
          <div class="setting-row">
            <div class="setting-label-group">
              <span class="setting-label">{{ lang === 'en' ? 'Auto-stop duration' : '自动停止时间' }}</span>
              <span class="setting-desc">{{ lang === 'en' ? 'Seconds before the roller stops automatically.' : '点名开始后，经过指定秒数自动停止。' }}</span>
            </div>
            <div class="scale-control">
              <div class="scale-input-wrap" style="width: 140px">
                <FluentNumberBox
                  :model-value="settings.autoStopDuration"
                  :min="1"
                  :max="60"
                  :step="1"
                  :show-spin-buttons="false"
                  :aria-label="lang === 'en' ? 'Auto-stop duration in seconds' : '自动停止时间（秒）'"
                  style="flex: 1; min-width: 0"
                  @update:model-value="onAutoStopDurationChange"
                />
                <span class="scale-unit">sec</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Result emphasis' : '结果强调动画' }}</span>
        <FluentSelect :model-value="settings.finishAnimation" :options="finishAnimationOptions" width="220px" @update:model-value="update('finishAnimation', $event)" />
      </div>
      <div class="setting-row">
        <div class="setting-label-group">
          <span class="setting-label">{{ t('multiStepStop', lang) }}</span>
        </div>
        <FluentToggle :model-value="settings.multiStepStop" :aria-label="lang === 'en' ? 'Reveal results one by one' : '逐个揭示结果'" @update:model-value="update('multiStepStop', $event)" />
      </div>
      <Transition name="toggle-expand">
        <div v-if="settings.multiStepStop" class="sub-setting">
          <div class="setting-row">
            <span class="setting-label">{{ t('stepStopInterval', lang) }}</span>
            <div class="scale-control">
              <div class="scale-input-wrap" style="width:140px">
                <FluentNumberBox v-model="stepIntervalDraft" :min="0.01" :max="1.00" :step="0.01" :show-spin-buttons="false" style="flex: 1; min-width: 0" aria-label="Step interval" />
                <span class="scale-unit">sec</span>
              </div>
              <FluentButton variant="secondary" size="sm" @click="confirmStepInterval">{{ lang === 'en' ? 'Apply' : '确认' }}</FluentButton>
            </div>
          </div>
        </div>
      </Transition>
    </FluentCard>

    <!-- 平衡算法 -->
    <FluentCard v-if="section === 'features'" class="settings-section">
      <h3 class="section-title"><FluentIcon icon="data-line-24-regular" :width="20" /> {{ t('balanceSettings', lang) }}</h3>
      <div class="setting-row">
        <span class="setting-label">{{ lang === 'en' ? 'Enable Balance' : '启用平衡算法' }}</span>
          <FluentToggle :model-value="balance.enabled" :aria-label="lang === 'en' ? 'Enable balance algorithm' : '启用平衡算法'" @update:model-value="onBalanceEnabledChange" />
      </div>
      <Transition name="toggle-expand">
        <div v-if="balance.enabled" class="balance-sub">
          <p class="balance-explain">{{ lang === 'en' ? 'The fairness target is fixed at an absolute gap of 2. Every candidate keeps a non-zero probability, so 2 is a strong soft target rather than an impossible hard guarantee.' : '公平算法固定以绝对极差 2 为软目标。每个人始终保留非零概率，因此会强力趋近 2，但不会作不可能的硬性保证。' }}</p>
          <div class="balance-info">
            <FluentIcon icon="info-16-regular" :width="14" />
            <span>{{ lang === 'en' ? `Algorithm: ${ALGORITHM_NAME} v${ALGORITHM_VERSION} · Parameters are protected` : `算法: ${ALGORITHM_NAME} v${ALGORITHM_VERSION} · 公平参数不可修改` }}</span>
          </div>
        </div>
      </Transition>
    </FluentCard>

    <!-- 更新日志 -->
    <FluentCard v-if="section === 'data'" class="settings-section">
      <h3 class="section-title"><FluentIcon icon="list-24-regular" :width="20" /> {{ t('changelog', lang) }}</h3>
      <div class="changelog-list">
        <div v-for="log in changelog" :key="log.version" class="changelog-item">
          <div class="changelog-header"><span class="changelog-version">{{ log.version }}</span><span class="changelog-date">{{ log.date }}</span></div>
          <ul class="changelog-logs"><li v-for="(entry, i) in getLogEntries(log)" :key="i">{{ entry }}</li></ul>
        </div>
      </div>
    </FluentCard>

    <FluentModal v-model="showPwModal" :title="pwModalTitle" max-width="400px">
      <div class="pw-modal-body">
        <p class="pw-hint">{{ pwModalHint }}</p>
        <FluentInput v-model="pwInput" type="password" :placeholder="lang === 'en' ? 'Password' : '密码'" @enter="confirmPassword" />
        <p v-if="pwError" class="pw-error">{{ pwError }}</p>
      </div>
      <template #footer>
        <FluentButton variant="secondary" size="sm" @click="showPwModal = false">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton>
        <FluentButton variant="primary" size="sm" @click="confirmPassword">{{ lang === 'en' ? 'Confirm' : '确认' }}</FluentButton>
      </template>
    </FluentModal>

    <FloatingImageCropper v-model="showFloatingCropper" :source="floatingCropSource" :lang="lang" @save="saveFloatingWindowImage" />

    <FluentModal v-model="showImportWarning" :title="lang === 'en' ? 'Warning' : '警告'" max-width="440px">
      <div class="pw-modal-body">
        <p class="pw-hint">{{ lang === 'en' ? 'This will overwrite all data. Continue?' : '将覆盖所有数据，是否继续？' }}</p>
      </div>
      <template #footer>
        <FluentButton variant="secondary" size="sm" @click="showImportWarning = false">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton>
        <FluentButton variant="danger" size="sm" @click="confirmImport">{{ lang === 'en' ? 'Import' : '确认导入' }}</FluentButton>
      </template>
    </FluentModal>

    <FluentModal v-model="showUriHelp" :title="isTauri() ? (lang === 'en' ? 'Cyrene URI usage' : 'Cyrene URI 调用方式') : (lang === 'en' ? 'One-time URL parameters' : 'URL 一次性参数')" max-width="760px">
      <div class="uri-help-body">
        <p class="uri-help-intro">
          {{ isTauri()
            ? (lang === 'en' ? 'After enabling URI registration, external links can reveal the existing app window or navigate to a page.' : '启用 URI 注册后，外部链接可以呼出已经运行的程序，或直接跳转到指定页面。')
            : (lang === 'en' ? 'Web parameters are appended after the hash route. They apply only to this navigation and do not overwrite saved settings.' : 'Web 参数应添加在 Hash 路由之后，仅对本次进入生效，不会覆盖已保存的设置。') }}
        </p>

        <div class="uri-example-block">
          <div class="uri-example-header"><strong>{{ isTauri() ? (lang === 'en' ? 'Reveal / open' : '呼出或打开') : (lang === 'en' ? 'Open the Roller page' : '打开点名器页面') }}</strong><FluentButton variant="subtle" size="sm" @click="copyUriExample(uriStartExample)"><FluentIcon icon="copy-16-regular" :width="14" />{{ lang === 'en' ? 'Copy' : '复制' }}</FluentButton></div>
          <code>{{ uriStartExample }}</code>
        </div>
        <div class="uri-example-block">
          <div class="uri-example-header"><strong>{{ lang === 'en' ? 'Roller with one-time parameters' : '带一次性参数打开点名器' }}</strong><FluentButton variant="subtle" size="sm" @click="copyUriExample(uriRollerExample)"><FluentIcon icon="copy-16-regular" :width="14" />{{ lang === 'en' ? 'Copy' : '复制' }}</FluentButton></div>
          <code>{{ uriRollerExample }}</code>
          <span>{{ lang === 'en' ? 'A valid Roller parameter set starts rolling immediately; the user stops it normally.' : '只要包含有效的点名参数，就会自动开始滚动；之后由用户正常点击停止。' }}</span>
        </div>

        <div class="uri-help-section">
          <h4>{{ lang === 'en' ? 'Available pages' : '可用页面' }}</h4>
          <div class="uri-route-grid"><div v-for="route in uriHelpRoutes" :key="route.id"><code>{{ route.path }}</code><span>{{ route.label }}</span></div></div>
        </div>

        <div class="uri-help-section">
          <h4>{{ lang === 'en' ? 'Roller-only parameters' : '仅点名器可用的参数' }}</h4>
          <div class="uri-parameter-table">
            <div class="uri-parameter-row header"><strong>{{ lang === 'en' ? 'Parameter' : '参数' }}</strong><strong>{{ lang === 'en' ? 'Values' : '可选值' }}</strong><strong>{{ lang === 'en' ? 'Meaning' : '含义' }}</strong></div>
            <div v-for="item in uriHelpParameters" :key="item.name" class="uri-parameter-row"><code>{{ item.name }}</code><code>{{ item.values }}</code><span>{{ item.label }}</span></div>
          </div>
          <p class="uri-value-note">{{ lang === 'en' ? 'Boolean values accept 1/0 or true/false. count goes up to 999999. Parameters on other pages are ignored.' : '布尔值可使用 1/0 或 true/false；count 最高 999999；其他页面会忽略这些参数。' }}</p>
        </div>
      </div>
      <template #footer><FluentButton variant="primary" size="sm" @click="showUriHelp = false">{{ lang === 'en' ? 'Done' : '完成' }}</FluentButton></template>
    </FluentModal>

    <!-- Cyreneの罗盘 推荐提示/下载列表 -->
    <FluentModal v-model="showCompass" :title="lang === 'en' ? 'A Better Companion' : '诚挚邀请体验 Cyreneの罗盘'" max-width="560px">
      <div v-if="compassStep === 'invite'" class="compass-invite-body">
        <div class="compass-invite-hero">
          <img src="/starcyrene.ico" alt="CyreneCompass" class="compass-invite-logo" />
          <div class="compass-invite-text">
            <h4 class="compass-invite-title">Cyreneの罗盘 <span class="compass-invite-en">CyreneCompass</span></h4>
            <p class="compass-invite-desc">
              {{ lang === 'en'
                ? 'A tray resident compass launcher with far more capabilities: draggable floating ball, 3×3 compass menu, Shell integration, always-on-top, and more.'
                : '一款托盘常驻的罗盘快捷启动器，功能更全面：可拖动悬浮球、3×3 罗盘菜单、Shell 集成、置顶显示、更多实用能力。' }}
            </p>
          </div>
        </div>
        <p class="compass-invite-slogan">
          {{ lang === 'en' ? 'Try Cyreneの罗盘 to unlock a more complete experience.' : '开启悬浮窗快捷点名前，诚挚邀请你体验功能更全面的 Cyreneの罗盘。' }}
        </p>
      </div>

      <div v-else class="compass-download-body">
        <div class="compass-download-toolbar">
          <FluentButton variant="subtle" size="sm" icon-only @click="compassStep = 'invite'">
            <FluentIcon icon="arrow-left-16-regular" :width="16" />
          </FluentButton>
          <span class="compass-download-hint">
            {{ lang === 'en' ? 'Choose a release to download. It follows your update download source.' : '请选择要下载的版本，将按你设定的更新下载源下载。' }}
          </span>
        </div>

        <div v-if="compassLoading" class="compass-download-status">
          <FluentProgressRing :size="20" />
          <span>{{ lang === 'en' ? 'Loading releases…' : '正在获取发布列表…' }}</span>
        </div>
        <div v-else-if="compassError" class="compass-download-status compass-error">
          <FluentIcon icon="warning-16-regular" :width="16" />
          <span>{{ compassError }}</span>
          <FluentButton variant="subtle" size="sm" @click="loadCompassReleases">
            <FluentIcon icon="arrow-clockwise-16-regular" :width="14" />
            {{ lang === 'en' ? 'Retry' : '重试' }}
          </FluentButton>
        </div>
        <div v-else-if="!compassReleases.length" class="compass-download-status">
          <span>{{ lang === 'en' ? 'No releases yet.' : '暂无发布版本。' }}</span>
        </div>
        <div v-else class="compass-release-list">
          <div v-for="release in compassReleases" :key="release.id" class="compass-release">
            <div class="compass-release-head">
              <span class="compass-release-tag">{{ release.tag_name }}</span>
              <span v-if="release.published_at" class="compass-release-date">{{ new Date(release.published_at).toLocaleDateString() }}</span>
            </div>
            <p v-if="release.name" class="compass-release-name">{{ release.name }}</p>
            <div class="compass-asset-list">
              <div v-for="asset in release.assets" :key="asset.id" class="compass-asset">
                <div class="compass-asset-info">
                  <span class="compass-asset-name" :title="asset.name">{{ asset.name }}</span>
                  <span v-if="asset.size" class="compass-asset-size">{{ formatBytes(asset.size) }}</span>
                </div>
                <FluentButton
                  variant="secondary"
                  size="sm"
                  :disabled="!!compassDownloading"
                  @click="downloadCompassAsset(asset)"
                >
                  <FluentIcon icon="arrow-download-16-regular" :width="14" />
                  {{ compassDownloading === asset.name ? (lang === 'en' ? 'Opening…' : '打开中…') : (lang === 'en' ? 'Download' : '下载') }}
                </FluentButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <template v-if="compassStep === 'invite'">
          <FluentButton variant="subtle" size="sm" @click="acceptFloatingWindow">{{ lang === 'en' ? 'No, thanks' : '不了，谢谢' }}</FluentButton>
          <FluentButton variant="primary" size="sm" @click="openCompassDownloads">
            <FluentIcon icon="arrow-download-16-regular" :width="14" />
            {{ lang === 'en' ? 'Download Cyreneの罗盘' : '下载 Cyreneの罗盘' }}
          </FluentButton>
        </template>
        <FluentButton v-else variant="primary" size="sm" @click="acceptFloatingWindow">{{ lang === 'en' ? 'Continue' : '继续' }}</FluentButton>
      </template>
    </FluentModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch, inject } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import { useStatisticsStore } from '../stores/statistics'
import { getCoreClient } from '../core/client'
import { dataBridge } from '../utils/dataBridge'
import { isTauri, tauriAPI } from '../utils/tauriAPI'
import { updateState, checkForUpdates, downloadUpdate, getDownloadUrl } from '../utils/updater'
import { fetchCompassReleases, formatBytes, COMPASS_GITHUB_URL } from '../utils/compass'
import { t } from '../utils/i18n'
import {
  DEFAULT_CYRENE_BALANCE_SETTINGS,
  normalizeCyreneBalanceSettings,
  ALGORITHM_NAME,
  ALGORITHM_VERSION
} from '../utils/cyrene-balance'
import { normalizeHex } from '../utils/theme'
import {
  FLOATING_WINDOW_STYLES,
  floatingWindowImagePath,
  MAX_FLOATING_WINDOW_OPACITY,
  MIN_FLOATING_WINDOW_OPACITY,
  normalizeFloatingWindowOpacity,
  normalizeFloatingWindowRadius,
  normalizeFloatingWindowStyle,
  resolveFloatingWindowRadius
} from '../utils/floatingWindowStyle'
import {
  floatingWindowTextSize,
  MAX_FLOATING_WINDOW_TEXT_SIZE,
  MIN_FLOATING_WINDOW_TEXT_SIZE,
  normalizeFloatingWindowSize,
  normalizeFloatingWindowTextSize
} from '../utils/floatingWindowSize'
import {
  DEFAULT_FLOATING_WINDOW_TEXT,
  MAX_FLOATING_WINDOW_TEXT_LENGTH,
  normalizeFloatingWindowBackgroundColor,
  normalizeFloatingWindowText,
  normalizeFloatingWindowTextColor
} from '../utils/floatingWindowText'
import { normalizeAutoStopDuration } from '../utils/autoStop.mjs'
import { isWindowsTauri } from '../utils/desktopRuntime.js'
import FloatingImageCropper from '../components/FloatingImageCropper.vue'

defineProps({
  section: { type: String, default: 'general' }
})

const settingsStore = useSettingsStore()
const pluginsStore = usePluginsStore()
const namesStore = useNamesStore()
const statisticsStore = useStatisticsStore()
const coreClient = getCoreClient()
const showBanner = inject('banner')

const lang = computed(() => settingsStore.settings.language)
const settings = computed(() => settingsStore.settings)
const isDesktop = computed(() => isTauri())
const isWindows = computed(() => isWindowsTauri())
const floatingStyleOptions = computed(() => FLOATING_WINDOW_STYLES.map((value, index) => ({
  value,
  label: value === 'text'
    ? (lang.value === 'en' ? 'Text' : '文字')
    : value === 'custom'
      ? (lang.value === 'en' ? 'Custom' : '自定义')
      : (lang.value === 'en' ? `Image ${index}` : `图片 ${index}`)
})))
const floatingSizeDraft = ref(normalizeFloatingWindowSize(settings.value.floatingWindowSize))
const floatingTextDraft = ref(normalizeFloatingWindowText(settings.value.floatingWindowText))
const floatingTextPreview = computed(() => normalizeFloatingWindowText(floatingTextDraft.value))
const floatingTextSizeMax = computed(() => floatingWindowTextSize(
  settings.value.floatingWindowSize,
  floatingTextPreview.value,
  MAX_FLOATING_WINDOW_TEXT_SIZE
))
const floatingTextSizeDraft = ref(floatingWindowTextSize(
  settings.value.floatingWindowSize,
  floatingTextPreview.value,
  settings.value.floatingWindowTextSize
))
const supportsFloatingRadius = computed(() => ['text', 'custom'].includes(settings.value.floatingWindowStyle))
const floatingRadiusDraft = ref(resolveFloatingWindowRadius(settings.value.floatingWindowRadius, settings.value.floatingWindowStyle))
const floatingOpacityDraft = ref(normalizeFloatingWindowOpacity(settings.value.floatingWindowOpacity))
const showFloatingCropper = ref(false)
const floatingCropSource = ref('')
watch(() => settings.value.floatingWindowSize, value => {
  floatingSizeDraft.value = normalizeFloatingWindowSize(value)
})
watch(() => settings.value.floatingWindowText, value => {
  floatingTextDraft.value = normalizeFloatingWindowText(value)
})
watch(() => [
  floatingTextPreview.value,
  settings.value.floatingWindowTextSize,
  settings.value.floatingWindowSize
], () => {
  floatingTextSizeDraft.value = floatingWindowTextSize(
    settings.value.floatingWindowSize,
    floatingTextPreview.value,
    settings.value.floatingWindowTextSize
  )
})
watch(() => [settings.value.floatingWindowRadius, settings.value.floatingWindowStyle], ([radius, style]) => {
  floatingRadiusDraft.value = resolveFloatingWindowRadius(radius, style)
})
watch(() => settings.value.floatingWindowOpacity, value => {
  floatingOpacityDraft.value = normalizeFloatingWindowOpacity(value)
})

const langOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' }
]
const scaleDraft = ref(settings.value.uiScale)
watch(() => settings.value.uiScale, (v) => { scaleDraft.value = v })
const scaleChanged = computed(() => {
  const v = Math.round(Number(scaleDraft.value))
  if (!Number.isFinite(v)) return false
  return v !== Math.round(settings.value.uiScale)
})
function confirmScale() {
  let v = Math.round(Number(scaleDraft.value))
  if (!Number.isFinite(v)) v = settings.value.uiScale
  v = Math.min(200, Math.max(50, v))
  scaleDraft.value = v
  update('uiScale', v)
}
const fontSizeOptions = [
  { value: 0.75, label: '0.75x' }, { value: 1.0, label: '1.0x' }, { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' }, { value: 1.75, label: '1.75x' }, { value: 2.0, label: '2.0x' }
]

const colorModeOptions = [
  { value: 'gradient', label: lang.value === 'en' ? 'Gradient' : '渐变' },
  { value: 'custom', label: lang.value === 'en' ? 'Custom Solid' : '自定义单色' }
]

const fontOptions = [
  { value: 'HarmonyOS', label: 'HarmonyOS Sans SC' },
  { value: 'MiSans', label: 'Mi Sans' }
]
const colorThemeOptions = computed(() => [
  { value: 'peach', label: lang.value === 'en' ? 'Peach' : '桃粉', icon: 'fluent:heart-16-regular' },
  { value: 'fluent', label: 'Fluent', icon: 'fluent:window-16-regular' },
  { value: 'custom', label: lang.value === 'en' ? 'Custom' : '自定义', icon: 'fluent:color-16-regular' },
  ...pluginsStore.appearanceOptions(lang.value).map(option => ({
    ...option,
    label: `${option.label} · ${option.pluginName}`
  }))
])
const downloadSourceOptions = computed(() => [
  { value: 'cyrene', label: 'gh.昔涟.cn', icon: 'fluent:cloud-arrow-down-16-regular' },
  { value: 'github', label: 'GitHub', icon: 'fluent:code-16-regular' },
  { value: 'ghproxy', label: 'gh-proxy.com', icon: 'fluent:globe-16-regular' }
])
const autoStartModeOptions = computed(() => [
  { value: 'scheduled', label: lang.value === 'en' ? 'Administrator scheduled task' : '管理员计划任务', icon: 'fluent:shield-keyhole-16-regular' },
  { value: 'registry', label: lang.value === 'en' ? 'Traditional startup entry' : '传统自启动项', icon: 'fluent:window-console-20-regular' }
])
const newMemberCountModeOptions = computed(() => [
  { value: 'midpoint', label: lang.value === 'en' ? 'Current range midpoint' : '当前极值中间值', icon: 'fluent:branch-compare-16-regular' },
  { value: 'zero', label: lang.value === 'en' ? 'Start from zero' : '从 0 开始', icon: 'fluent:number-symbol-16-regular' }
])
const finishAnimationOptions = computed(() => [
  { value: 'spotlight', label: lang.value === 'en' ? 'Classic emphasis' : '经典强调', icon: 'fluent:sparkle-16-regular' },
  { value: 'lift', label: lang.value === 'en' ? 'Lift' : '跃升', icon: 'fluent:arrow-up-16-regular' },
  { value: 'glow', label: lang.value === 'en' ? 'Glow' : '辉光', icon: 'fluent:weather-sunny-16-regular' }
])

const balance = ref({ ...DEFAULT_CYRENE_BALANCE_SETTINGS })
const changelog = ref([])
const hasPassword = ref(false)
const showPwModal = ref(false)
const pwInput = ref('')
const pwError = ref('')
const pwModalMode = ref('verify')
const pendingAction = ref(null)
const showImportWarning = ref(false)
const showUriHelp = ref(false)
const showCompass = ref(false)
const compassStep = ref('invite')
const compassReleases = ref([])
const compassLoading = ref(false)
const compassError = ref('')
const compassDownloading = ref('')

const webUrlBase = computed(() => {
  if (typeof window === 'undefined') return 'https://example.com/'
  return `${window.location.origin}${window.location.pathname}`
})
const uriStartExample = computed(() => isTauri() ? 'cyrenenr://start' : `${webUrlBase.value}#/roller`)
const uriRollerExample = computed(() => isTauri()
  ? 'cyrenenr://page/roller?isEN=0&isGroupMode=0&sex=all&multiMode=1&count=6&noDuplication=0'
  : `${webUrlBase.value}#/roller?isEN=0&isGroupMode=0&sex=all&multiMode=1&count=6&noDuplication=0`)
const uriHelpRoutes = computed(() => [
  { id: 'roller', path: isTauri() ? 'cyrenenr://page/roller' : '#/roller', label: lang.value === 'en' ? 'Random roller' : '随机点名' },
  { id: 'card', path: isTauri() ? 'cyrenenr://page/cards' : '#/card', label: lang.value === 'en' ? 'Card draw' : '翻牌点名' },
  { id: 'lottery', path: isTauri() ? 'cyrenenr://page/lottery' : '#/lottery/draw', label: lang.value === 'en' ? 'Lottery draw' : '奖品抽取' },
  { id: 'lists', path: isTauri() ? 'cyrenenr://page/lists' : '#/lists', label: lang.value === 'en' ? 'People lists' : '人员名单' },
  { id: 'records', path: isTauri() ? 'cyrenenr://page/records' : '#/records', label: lang.value === 'en' ? 'Draw records' : '抽取记录' },
  { id: 'statistics', path: isTauri() ? 'cyrenenr://page/statistics' : '#/statistics', label: lang.value === 'en' ? 'Statistics' : '数据统计' },
  { id: 'plugins', path: isTauri() ? 'cyrenenr://page/plugins' : '#/plugins', label: lang.value === 'en' ? 'Plugins' : '插件' },
  { id: 'settings', path: isTauri() ? 'cyrenenr://page/settings' : '#/settings', label: lang.value === 'en' ? 'Settings' : '设置' }
])
const uriHelpParameters = computed(() => [
  { name: 'isEN', values: '0 / 1', label: lang.value === 'en' ? 'Disable or enable English Mode' : '关闭或开启 English Mode' },
  { name: 'isGroupMode', values: '0 / 1', label: lang.value === 'en' ? 'Draw people or groups' : '抽取人员或抽取小组' },
  { name: 'sex', values: 'all / male / female', label: lang.value === 'en' ? 'Gender filter for people' : '人员性别筛选' },
  { name: 'multiMode', values: '0 / 1', label: lang.value === 'en' ? 'Single or multiple draw mode' : '单次或多人/多次抽取' },
  { name: 'count', values: '1–999999', label: lang.value === 'en' ? 'Number of people or groups' : '抽取人数或小组数量' },
  { name: 'noDuplication', values: '0 / 1', label: lang.value === 'en' ? 'Allow or prevent duplicate results' : '允许或禁止重复结果' }
])

const pwModalTitle = computed(() => {
  if (pwModalMode.value === 'set') return lang.value === 'en' ? 'Set Password' : '设置密码'
  if (pwModalMode.value === 'change') return lang.value === 'en' ? 'Change Password' : '修改密码'
  return lang.value === 'en' ? 'Verify Password' : '验证密码'
})
const pwModalHint = computed(() => {
  if (pwModalMode.value === 'set') return lang.value === 'en' ? 'Set a password:' : '设置密码：'
  if (pwModalMode.value === 'change') return lang.value === 'en' ? 'Verify current password:' : '请验证当前密码：'
  return lang.value === 'en' ? 'Enter password:' : '请输入密码：'
})

function update(key, value) { return settingsStore.update(key, value) }

function onAutoStopDurationChange(value) {
  update('autoStopDuration', normalizeAutoStopDuration(value))
}
const customColorDraft = ref(settings.value.customThemeColor)
const autoStartBusy = ref(false)
const uriSchemeBusy = ref(false)
const portableMode = ref(false)
const portableModeBusy = ref(false)
watch(() => settings.value.customThemeColor, value => { customColorDraft.value = value })
function commitCustomColor() {
  const normalized = normalizeHex(customColorDraft.value, '')
  if (!normalized) {
    customColorDraft.value = settings.value.customThemeColor
    return
  }
  customColorDraft.value = normalized
  update('customThemeColor', normalized)
}
function onCustomColorPicker(value) {
  customColorDraft.value = value
  commitCustomColor()
}
async function onAutoStart(value) {
  autoStartBusy.value = true
  const previousValue = !value
  const mode = settings.value.autoStartMode || 'registry'
  await update('autoStart', value)
  const result = await tauriAPI.setAutoStart(value, mode, mode)
  if (!result || result.success === false) {
    if (isWindows.value && result?.requiresElevation && value && mode === 'scheduled') {
      await fallbackToRegistryAutoStart({ rollbackEnabled: previousValue, rollbackMode: mode })
    } else {
      await update('autoStart', previousValue)
      if (isWindows.value && result?.requiresElevation) offerAutoStartElevation({ enabled: value, mode, previousMode: mode, rollbackEnabled: previousValue, rollbackMode: mode })
      else showBanner({ message: result?.error || (lang.value === 'en' ? 'Startup task update failed' : '启动项更新失败'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
    }
  } else if (!result.restarting) {
    showBanner({
      message: value
        ? (lang.value === 'en' ? 'Startup entry created' : '开机启动已启用')
        : (lang.value === 'en' ? 'Startup entry removed' : '开机启动已关闭'),
      icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000
    })
  }
  autoStartBusy.value = false
}

async function onUriSchemeToggle(value) {
  uriSchemeBusy.value = true
  const result = await tauriAPI.setUriSchemeEnabled(value)
  if (result?.success) {
    await update('uriSchemeEnabled', value)
    showBanner({
      message: value
        ? (lang.value === 'en' ? 'cyrenenr:// links are enabled' : 'cyrenenr:// 协议已启用')
        : (lang.value === 'en' ? 'cyrenenr:// links are disabled' : 'cyrenenr:// 协议已关闭'),
      icon: value ? 'link-16-regular' : 'link-dismiss-16-regular',
      type: 'success',
      duration: 5000
    })
  } else {
    showBanner({ message: result?.error || (lang.value === 'en' ? 'URI protocol update failed' : 'URI 协议更新失败'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
  }
  uriSchemeBusy.value = false
}

async function copyUriExample(value) {
  try {
    await navigator.clipboard.writeText(value)
    showBanner({ message: lang.value === 'en' ? 'Example copied' : '调用示例已复制', icon: 'checkmark-circle-16-regular', type: 'success', duration: 3000 })
  } catch {
    showBanner({ message: lang.value === 'en' ? 'Copy failed; select the text manually' : '复制失败，请手动选择文本', icon: 'warning-16-regular', type: 'warning', duration: 5000 })
  }
}

async function onAutoStartModeChange(mode) {
  const previousMode = settings.value.autoStartMode || 'registry'
  if (mode === previousMode) return
  await update('autoStartMode', mode)
  if (!settings.value.autoStart) return
  autoStartBusy.value = true
  const result = await tauriAPI.setAutoStart(true, mode, previousMode)
  if (!result || result.success === false) {
    if (isWindows.value && result?.requiresElevation && mode === 'scheduled') {
      await fallbackToRegistryAutoStart({ rollbackEnabled: true, rollbackMode: previousMode })
    } else {
      await update('autoStartMode', previousMode)
      if (isWindows.value && result?.requiresElevation) offerAutoStartElevation({ enabled: true, mode, previousMode, rollbackEnabled: true, rollbackMode: previousMode })
      else showBanner({ message: result?.error || (lang.value === 'en' ? 'Startup method update failed' : '启动方式更新失败'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
    }
  } else {
    showBanner({ message: lang.value === 'en' ? 'Startup method updated' : '启动方式已更新', icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 })
  }
  autoStartBusy.value = false
}

async function fallbackToRegistryAutoStart({ rollbackEnabled, rollbackMode }) {
  await update('autoStart', true)
  await update('autoStartMode', 'registry')
  const result = await tauriAPI.setAutoStart(true, 'registry', 'registry')
  if (!result || result.success === false) {
    await update('autoStart', rollbackEnabled)
    await update('autoStartMode', rollbackMode)
    showBanner({
      message: result?.error || (lang.value === 'en' ? 'Traditional startup entry creation failed' : '传统自启动项创建失败'),
      icon: 'warning-16-regular', type: 'warning', duration: 8000
    })
    return false
  }
  showBanner({
    message: lang.value === 'en'
      ? 'Administrator permission is unavailable. Switched to the traditional startup entry.'
      : '当前没有管理员权限，已改用传统自启动项',
    icon: 'shield-keyhole-16-regular', type: 'warning', duration: 8000
  })
  return true
}

function offerAutoStartElevation({ enabled, mode, previousMode, rollbackEnabled, rollbackMode }) {
  showBanner({
    message: lang.value === 'en' ? 'Administrator permission is required to update the scheduled task.' : '修改管理员计划任务需要提升权限。',
    icon: 'shield-keyhole-16-regular',
    type: 'warning',
    duration: 0,
    dismissible: true,
    actionLabel: lang.value === 'en' ? 'Restart as administrator' : '以管理员身份重启',
    action: async () => {
      await update('autoStart', enabled)
      await update('autoStartMode', mode)
      const result = await tauriAPI.restartElevatedForAutoStart(enabled, mode, previousMode)
      if (!result?.success) {
        await update('autoStart', rollbackEnabled)
        await update('autoStartMode', rollbackMode)
        showBanner({ message: result?.error || (lang.value === 'en' ? 'Administrator restart failed' : '管理员重启失败'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
        return false
      }
      return true
    }
  })
}

async function onFloatingWindowToggle(val) {
  await update('floatingWindowEnabled', val)
  if (!val) {
    // 关闭时会话结束：重置提示状态，下次再开启会再次询问
    await update('floatingCompassHintDismissed', false)
    if (isTauri()) {
      await tauriAPI.invoke('close_floating_window')
    }
    return
  }
  if (settings.value.floatingCompassHintDismissed) {
    if (isTauri()) {
      await tauriAPI.invoke('open_floating_window')
    }
    return
  }
  // 首次开启悬浮窗：先展示 Cyreneの罗盘 推荐提示，确认后再激活悬浮窗
  showCompass.value = true
  compassStep.value = 'invite'
}

async function acceptFloatingWindow() {
  showCompass.value = false
  await update('floatingCompassHintDismissed', true)
  if (isTauri()) {
    await tauriAPI.invoke('open_floating_window')
  }
}

function openCompassDownloads() {
  compassStep.value = 'downloads'
  if (!compassReleases.value.length && !compassLoading.value) loadCompassReleases()
}

async function loadCompassReleases() {
  compassLoading.value = true
  compassError.value = ''
  try {
    const releases = await fetchCompassReleases()
    compassReleases.value = releases.filter(r => Array.isArray(r.assets) && r.assets.length)
  } catch {
    compassError.value = '无法获取 Cyreneの罗盘 的发布列表'
  } finally {
    compassLoading.value = false
  }
}

async function downloadCompassAsset(asset) {
  if (!asset?.browser_download_url) return
  compassDownloading.value = asset.name
  try {
    const url = getDownloadUrl(asset.browser_download_url)
    if (isTauri()) {
      await tauriAPI.openExternal(url)
    } else {
      window.open(url, '_blank', 'noopener')
    }
  } catch {
    if (isTauri()) await tauriAPI.openExternal(COMPASS_GITHUB_URL)
    else window.open(COMPASS_GITHUB_URL, '_blank', 'noopener')
  } finally {
    compassDownloading.value = ''
    acceptFloatingWindow()
  }
}

async function onFloatingWindowStyleChange(value) {
  const style = normalizeFloatingWindowStyle(value)
  if (style === 'custom' && !settings.value.floatingWindowCustomImage) {
    selectFloatingWindowImage()
    return
  }
  settingsStore.settings.floatingWindowStyle = style
  const syncing = syncFloatingWindowStyle()
  await settingsStore.save()
  await syncing
}

async function onPortableModeChange(enabled) {
  portableModeBusy.value = true
  try {
    const result = await tauriAPI.setPortableMode(enabled)
    portableMode.value = !!result.enabled
    showBanner({
      message: enabled
        ? (lang.value === 'en' ? 'Portable mode enabled. Data moved to the program directory.' : '便携模式已开启，数据已迁移到程序目录。')
        : (lang.value === 'en' ? 'Portable mode disabled. Data moved to AppData.' : '便携模式已关闭，数据已迁移到 AppData。'),
      icon: 'checkmark-circle-16-regular',
      type: 'success',
      duration: 6000
    })
  } catch (error) {
    showBanner({
      message: `${lang.value === 'en' ? 'Could not change portable mode' : '便携模式切换失败'}：${error?.message || String(error)}`,
      icon: 'warning-16-regular',
      type: 'warning',
      duration: 8000
    })
  } finally {
    portableModeBusy.value = false
  }
}

function syncFloatingWindowStyle(overrides = {}) {
  if (!isTauri()) return Promise.resolve()
  const style = overrides.style ?? settings.value.floatingWindowStyle
  floatingStylePending = [
    style,
    style === 'custom' ? (overrides.customImage ?? settings.value.floatingWindowCustomImage) : '',
    overrides.radius ?? settings.value.floatingWindowRadius,
    overrides.text ?? settings.value.floatingWindowText,
    overrides.backgroundColor ?? settings.value.floatingWindowBackgroundColor,
    overrides.textColor ?? settings.value.floatingWindowTextColor,
    overrides.textSize ?? settings.value.floatingWindowTextSize,
    overrides.opacity ?? settings.value.floatingWindowOpacity
  ]
  if (!floatingStyleRunning) floatingStyleDrain = processFloatingWindowStyleQueue()
  return floatingStyleDrain
}

let floatingStylePending = null
let floatingStyleRunning = false
let floatingStyleDrain = Promise.resolve()

async function processFloatingWindowStyleQueue() {
  floatingStyleRunning = true
  try {
    while (floatingStylePending) {
      const payload = floatingStylePending
      floatingStylePending = null
      await tauriAPI.setFloatingWindowStyle(...payload)
    }
  } finally {
    floatingStyleRunning = false
  }
}

let floatingAppearanceSaveTimer = null
let floatingAppearanceDirty = false
let floatingAppearanceSaving = false

function updateFloatingAppearanceSetting(key, value) {
  settingsStore.settings[key] = value
  floatingAppearanceDirty = true
  clearTimeout(floatingAppearanceSaveTimer)
  floatingAppearanceSaveTimer = setTimeout(persistFloatingAppearance, 300)
}

async function persistFloatingAppearance() {
  clearTimeout(floatingAppearanceSaveTimer)
  floatingAppearanceSaveTimer = null
  if (floatingAppearanceSaving || !floatingAppearanceDirty) return
  floatingAppearanceDirty = false
  floatingAppearanceSaving = true
  try {
    await settingsStore.save()
  } finally {
    floatingAppearanceSaving = false
    if (floatingAppearanceDirty) {
      floatingAppearanceSaveTimer = setTimeout(persistFloatingAppearance, 300)
    }
  }
}

function onFloatingWindowTextInput(value) {
  floatingTextDraft.value = Array.from(String(value ?? '')).slice(0, MAX_FLOATING_WINDOW_TEXT_LENGTH).join('')
  syncFloatingWindowStyle({ text: normalizeFloatingWindowText(floatingTextDraft.value) })
}

function commitFloatingWindowText() {
  const text = normalizeFloatingWindowText(floatingTextDraft.value)
  floatingTextDraft.value = text
  updateFloatingAppearanceSetting('floatingWindowText', text)
  syncFloatingWindowStyle()
}

function onFloatingWindowTextSizeInput(value) {
  const requested = Math.round(Number(value))
  const size = Math.min(
    floatingTextSizeMax.value,
    Math.max(MIN_FLOATING_WINDOW_TEXT_SIZE, Number.isFinite(requested) ? requested : floatingTextSizeDraft.value)
  )
  floatingTextSizeDraft.value = size
  updateFloatingAppearanceSetting('floatingWindowTextSize', normalizeFloatingWindowTextSize(size))
  syncFloatingWindowStyle({ textSize: size })
}

function onFloatingWindowBackgroundColor(value) {
  updateFloatingAppearanceSetting('floatingWindowBackgroundColor', normalizeFloatingWindowBackgroundColor(value))
  syncFloatingWindowStyle()
}

function onFloatingWindowTextColor(value) {
  updateFloatingAppearanceSetting('floatingWindowTextColor', normalizeFloatingWindowTextColor(value))
  syncFloatingWindowStyle()
}

function onFloatingWindowOpacityInput(value) {
  const opacity = normalizeFloatingWindowOpacity(value)
  floatingOpacityDraft.value = opacity
  updateFloatingAppearanceSetting('floatingWindowOpacity', opacity)
  syncFloatingWindowStyle({ opacity })
}

function selectFloatingWindowImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 12 * 1024 * 1024) {
      showBanner({ message: lang.value === 'en' ? 'Image must be smaller than 12 MB' : '图片不能超过 12 MB', icon: 'warning-16-regular', type: 'warning', duration: 6000 })
      return
    }
    floatingCropSource.value = await readImageFile(file)
    showFloatingCropper.value = true
  }
  input.click()
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function saveFloatingWindowImage(image) {
  settingsStore.settings.floatingWindowCustomImage = image
  settingsStore.settings.floatingWindowStyle = 'custom'
  const syncing = syncFloatingWindowStyle()
  await settingsStore.save()
  await syncing
}

let floatingRadiusPending = null
let floatingRadiusRunning = false
let floatingRadiusWaiters = []

function sendFloatingWindowRadius(radius) {
  if (!isTauri()) return Promise.resolve()
  floatingRadiusPending = radius
  const completion = new Promise(resolve => { floatingRadiusWaiters.push(resolve) })
  if (!floatingRadiusRunning) processFloatingWindowRadiusQueue()
  return completion
}

async function processFloatingWindowRadiusQueue() {
  floatingRadiusRunning = true
  while (floatingRadiusPending !== null) {
    const radius = floatingRadiusPending
    floatingRadiusPending = null
    await syncFloatingWindowStyle({ radius })
  }
  floatingRadiusRunning = false
  const waiters = floatingRadiusWaiters
  floatingRadiusWaiters = []
  waiters.forEach(resolve => resolve())
}

function onFloatingWindowRadiusInput(value) {
  const radius = normalizeFloatingWindowRadius(value)
  floatingRadiusDraft.value = radius
  sendFloatingWindowRadius(radius)
}

async function onFloatingWindowRadiusChange(value) {
  const radius = normalizeFloatingWindowRadius(value)
  floatingRadiusDraft.value = radius
  await update('floatingWindowRadius', radius)
  await sendFloatingWindowRadius(radius)
}

let floatingSizeTimer = null
let floatingSizePending = null
let floatingSizeRunning = false
let floatingSizeWaiters = []

function sendFloatingWindowSize(size) {
  floatingSizePending = size
  const completion = new Promise(resolve => { floatingSizeWaiters.push(resolve) })
  if (!floatingSizeRunning) processFloatingWindowSizeQueue()
  return completion
}

async function processFloatingWindowSizeQueue() {
  floatingSizeRunning = true
  let result = { success: true }
  while (floatingSizePending !== null) {
    const size = floatingSizePending
    floatingSizePending = null
    result = await tauriAPI.setFloatingWindowSize(size)
    if (result?.success === false) {
      showBanner({
        message: result.error || (lang.value === 'en' ? 'Failed to resize floating window' : '调整悬浮窗大小失败'),
        icon: 'warning-16-regular', type: 'warning', duration: 6000
      })
    }
  }
  floatingSizeRunning = false
  const waiters = floatingSizeWaiters
  floatingSizeWaiters = []
  waiters.forEach(resolve => resolve(result))
}

onBeforeUnmount(() => {
  clearTimeout(floatingAppearanceSaveTimer)
  void persistFloatingAppearance()
  clearTimeout(floatingSizeTimer)
  floatingSizePending = null
  floatingRadiusPending = null
  const waiters = floatingSizeWaiters
  floatingSizeWaiters = []
  waiters.forEach(resolve => resolve({ success: false, cancelled: true }))
  const radiusWaiters = floatingRadiusWaiters
  floatingRadiusWaiters = []
  radiusWaiters.forEach(resolve => resolve())
})

function onFloatingWindowSizeInput(value) {
  const size = normalizeFloatingWindowSize(value)
  floatingSizeDraft.value = size
  clearTimeout(floatingSizeTimer)
  floatingSizeTimer = setTimeout(() => { sendFloatingWindowSize(size) }, 60)
}

async function onFloatingWindowSizeChange(value) {
  const size = normalizeFloatingWindowSize(value)
  floatingSizeDraft.value = size
  clearTimeout(floatingSizeTimer)
  await update('floatingWindowSize', size)
  await sendFloatingWindowSize(size)
}

async function resetFloatingWindowPosition() {
  const result = await tauriAPI.resetFloatingWindowPosition()
  if (result?.success) {
    showBanner({
      message: lang.value === 'en' ? 'Floating window position reset' : '悬浮窗位置已重置',
      icon: 'checkmark-circle-16-regular', type: 'success', duration: 4000
    })
    return
  }
  showBanner({
    message: result?.error || (lang.value === 'en' ? 'Failed to reset floating window position' : '重置悬浮窗位置失败'),
    icon: 'warning-16-regular', type: 'warning', duration: 8000
  })
}

const stepIntervalDraft = ref(settings.value.stepStopInterval)
watch(() => settings.value.stepStopInterval, v => { stepIntervalDraft.value = v })
function confirmStepInterval() {
  let v = Number(stepIntervalDraft.value)
  if (!Number.isFinite(v)) v = 0.15
  v = Math.min(1.0, Math.max(0.01, Math.round(v * 100) / 100))
  stepIntervalDraft.value = v
  update('stepStopInterval', v)
}

function doCheckUpdate() { checkForUpdates(false, showBanner) }

async function doForceUpdate() {
  updateState.value.checking = true
  updateState.value.error = null
  try {
    const { fetchRelease, findPlatformAsset } = await import('../utils/updater')
    const release = await fetchRelease()
    if (release) {
      const assets = release.assets || []
      const remoteVersion = String(release.tag_name || '').replace(/^v/i, '').trim()
      const targetAsset = findPlatformAsset(assets, undefined, remoteVersion)
      updateState.value = {
        available: true, checking: false, downloading: false, downloadProgress: 0,
        version: release.tag_name,
        url: targetAsset ? targetAsset.browser_download_url : release.html_url,
        fileName: targetAsset ? targetAsset.name : '',
        fileSize: targetAsset ? targetAsset.size : 0,
        body: release.body || '', error: null
      }
      const sizeMB = targetAsset ? (targetAsset.size / 1024 / 1024).toFixed(1) : ''
      const sizeText = sizeMB ? ` (${sizeMB} MB)` : ''
      showBanner({ message: `发现新版本 ${release.tag_name}${sizeText}`, icon: 'arrow-download-16-regular', type: 'info', duration: 0, dismissible: true })
    } else {
      updateState.value.checking = false
      showBanner({ message: '无法连接到更新服务器', icon: 'warning-16-regular', type: 'warning', duration: 3000 })
    }
  } catch {
    updateState.value.checking = false
    showBanner({ message: '无法连接到更新服务器', icon: 'warning-16-regular', type: 'warning', duration: 3000 })
  }
}

function getLogEntries(log) {
  if (!log.logs) return []
  if (Array.isArray(log.logs)) return log.logs
  return log.logs[lang.value] || log.logs.zh || []
}

onMounted(async () => {
  if (isTauri()) {
    try { portableMode.value = !!(await tauriAPI.portableModeStatus()).enabled } catch {}
    let registered = !!(await tauriAPI.isUriSchemeEnabled())
    if (settings.value.uriSchemeEnabled && !registered) {
      const result = await tauriAPI.setUriSchemeEnabled(true)
      registered = !!result?.success
    }
    if (registered !== settings.value.uriSchemeEnabled) await update('uriSchemeEnabled', registered)
  }
  await loadPasswordHash()
  const saved = await dataBridge.load('balance')
  balance.value = normalizeCyreneBalanceSettings(saved)
  if (balance.value.enabled && !settings.value.recordCounts) settingsStore.update('recordCounts', true)
  if (saved && JSON.stringify(saved) !== JSON.stringify(balance.value)) {
    await dataBridge.save('balance', balance.value)
  }
  const logs = await dataBridge.loadChangelog()
  changelog.value = logs || []
})

async function sha256(str) { const d = new TextEncoder().encode(str); const h = await crypto.subtle.digest('SHA-256', d); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('') }
async function loadPasswordHash() { const s = await dataBridge.load('password'); if (s && s.hash) { hasPassword.value = true; return s.hash }; hasPassword.value = false; return null }
async function savePasswordHash(hash) { await dataBridge.save('password', { hash }); hasPassword.value = true }
function openPasswordModal() { pwModalMode.value = hasPassword.value ? 'change' : 'set'; pwInput.value = ''; pwError.value = ''; showPwModal.value = true }
async function confirmPassword() {
  pwError.value = ''
  if (pwModalMode.value === 'set') { if (!pwInput.value) { pwError.value = '请输入密码'; return }; await savePasswordHash(await sha256(pwInput.value)); showPwModal.value = false; pwInput.value = ''; if (pendingAction.value) { executePending(); pendingAction.value = null }; return }
  if (pwModalMode.value === 'change') { const s = await loadPasswordHash(); if (s && (await sha256(pwInput.value)) !== s) { pwError.value = '密码错误'; return }; pwModalMode.value = 'set'; pwInput.value = ''; return }
  const s = await loadPasswordHash(); if (!s) { showPwModal.value = false; executePending(); return }; if ((await sha256(pwInput.value)) !== s) { pwError.value = '密码错误'; return }; showPwModal.value = false; pwInput.value = ''; if (pendingAction.value) { executePending(); pendingAction.value = null }
}
function executePending() { const a = pendingAction.value; if (a === 'export') doExportNow(); else if (a === 'import') showImportWarning.value = true; else if (a === 'clearRecords') { void clearRecordsNow() } else if (a === 'clearAll') doClearAllNow() }
function requirePassword(action) { pendingAction.value = action; if (!hasPassword.value) { openPasswordModal(); return }; pwModalMode.value = 'verify'; pwInput.value = ''; pwError.value = ''; showPwModal.value = true }
function doExport() { requirePassword('export') }
function doImport() { requirePassword('import') }
function doClearRecords() { requirePassword('clearRecords') }
function doClearAll() { requirePassword('clearAll') }
async function doExportNow() {
  const result = await dataBridge.exportData()
  if (result?.success) showBanner({ message: lang.value === 'en' ? 'Data exported' : '程序数据导出成功', icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 })
  else if (!result?.cancelled) showBanner({ message: `${lang.value === 'en' ? 'Export failed' : '导出失败'}：${result?.error || (lang.value === 'en' ? 'Unknown error' : '未知错误')}`, icon: 'warning-16-regular', type: 'warning', duration: 8000 })
}
async function confirmImport() {
  showImportWarning.value = false
  const result = await dataBridge.importData()
  if (result.success) {
    showBanner({ message: lang.value === 'en' ? 'Import successful. Restart the app to apply it.' : '导入成功，重启应用后生效。', icon: 'checkmark-circle-16-regular', type: 'success', duration: 10000, dismissible: true })
  } else if (!result.cancelled) {
    showBanner({ message: lang.value === 'en' ? 'Import failed: ' + (result.error || 'Unknown') : '导入失败：' + (result.error || '未知错误'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
  }
}
async function doClearAllNow() {
  await dataBridge.clearAll()
  alert(lang.value === 'en' ? 'All data cleared. Please close and restart.' : '所有数据已清除，请关闭并重启应用。')
}
async function clearRecordsNow() {
  try {
    await coreClient.clearRecords()
    showBanner({ message: lang.value === 'en' ? 'Draw records cleared' : '抽签记录已清除', icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 })
  } catch (error) {
    showBanner({ message: error?.message || (lang.value === 'en' ? 'Could not clear draw records' : '抽签记录清除失败'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
  }
}
async function saveBalance() {
  balance.value = normalizeCyreneBalanceSettings(balance.value)
  await dataBridge.save('balance', balance.value)
}
function onBalanceEnabledChange(enabled) {
  balance.value.enabled = enabled
  if (enabled) settingsStore.update('recordCounts', true)
  saveBalance()
}
</script>

<style scoped>
.settings-view { padding: 32px; }
.page-title { font-family: var(--font-display); font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
.settings-section { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; gap: 16px; }
.setting-label { font-size: 14px; color: var(--text-secondary); }
.hex-color-input { width: 220px; }
.readonly-id { max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.setting-label-group { display: flex; flex-direction: column; gap: 2px; }
.setting-desc { font-size: 12px; color: var(--text-muted); }
.uri-setting-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.uri-help-body { display: flex; flex-direction: column; gap: 16px; color: var(--text-secondary); }
.uri-help-intro { margin: 0; font-size: 13px; line-height: 1.65; }
.uri-example-block { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--bg-subtle); }
.uri-example-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.uri-example-block code { display: block; padding: 9px 10px; overflow-x: auto; border-radius: var(--radius-sm); background: var(--bg-card-solid); color: var(--accent); font: 12px/1.55 Consolas, monospace; white-space: nowrap; }
.uri-example-block > span { color: var(--text-muted); font-size: 11px; line-height: 1.5; }
.uri-help-section { display: flex; flex-direction: column; gap: 10px; }
.uri-help-section h4 { margin: 0; color: var(--text-primary); font-size: 14px; }
.uri-route-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.uri-route-grid > div { display: flex; flex-direction: column; gap: 4px; padding: 9px 10px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
.uri-route-grid code, .uri-parameter-row code { color: var(--accent); font: 11px/1.45 Consolas, monospace; overflow-wrap: anywhere; }
.uri-route-grid span, .uri-parameter-row span { color: var(--text-muted); font-size: 11px; }
.uri-parameter-table { border: 1px solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; }
.uri-parameter-row { display: grid; grid-template-columns: minmax(110px, .55fr) minmax(130px, .7fr) minmax(190px, 1.4fr); gap: 10px; align-items: center; padding: 9px 11px; border-bottom: 1px solid var(--border-subtle); }
.uri-parameter-row:last-child { border-bottom: 0; }
.uri-parameter-row.header { background: var(--bg-subtle); color: var(--text-primary); font-size: 11px; }
.uri-value-note { margin: 0; color: var(--text-muted); font-size: 11px; line-height: 1.55; }
.balance-sub { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-default); display: flex; flex-direction: column; gap: 10px; }
.balance-explain { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.balance-info { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); padding: 8px 12px; background: var(--bg-subtle); border-radius: var(--radius-sm); }
.sub-setting { padding-left: 16px; border-left: 2px solid var(--accent-200); margin-left: 0; }
.floating-window-settings { display: flex; flex-direction: column; gap: 12px; margin: 4px 0 8px; }
.floating-style-setting { display: flex; flex-direction: column; gap: 10px; padding: 8px 0; }
.floating-style-options { display: flex; flex-wrap: wrap; gap: 10px; }
.floating-style-option {
  width: 82px; min-height: 88px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--bg-subtle);
  color: var(--text-secondary); cursor: pointer; transition: border-color var(--duration-fast), background var(--duration-fast);
}
.floating-style-option:hover { border-color: var(--border-strong); }
.floating-style-option.selected { border-color: var(--accent); background: var(--accent-50); color: var(--text-primary); }
.floating-style-option:has(.floating-style-radio:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.floating-style-radio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.floating-style-preview { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.floating-style-preview.text-preview { padding: 8px; font-weight: 600; line-height: 1.1; text-align: center; overflow-wrap: anywhere; box-sizing: border-box; }
.floating-style-preview img { width: 100%; height: 100%; display: block; object-fit: cover; }
.floating-style-label { max-width: 100%; font-size: 12px; line-height: 1.25; text-align: center; overflow-wrap: anywhere; }
.floating-custom-button { align-self: flex-start; }
.floating-text-settings { display: flex; flex-direction: column; padding-top: 4px; border-top: 1px solid var(--border-subtle); }
.floating-text-input { width: 220px; }
.floating-reset-row { padding: 4px 0; }
.floating-size-row { align-items: center; }
.floating-radius-row { align-items: center; }
.color-picker-row { display: flex; align-items: center; gap: 10px; }
.scale-control { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.scale-input-wrap {
  display: flex; align-items: center; gap: 2px;
  width: 200px; height: 32px; padding: 0 10px;
  transition: border-color .15s;
}
.scale-unit { color: var(--text-muted); font-size: 14px; }
.scale-range { font-size: 12px; color: var(--text-muted); }
.scale-btn-enter-active, .scale-btn-leave-active {
  overflow: hidden;
  transition: opacity .22s ease, transform .22s cubic-bezier(0.1, 0.9, 0.2, 1), max-width .25s ease;
}
.scale-btn-enter-from, .scale-btn-leave-to {
  opacity: 0;
  transform: translateX(-8px);
  max-width: 0;
}
.scale-btn-enter-to, .scale-btn-leave-from {
  opacity: 1;
  max-width: 120px;
}
.color-value { font-size: 13px; color: var(--text-muted); font-family: var(--font-ui); font-variant-numeric: tabular-nums; }
.action-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.pw-modal-body { padding: 8px 0; }
.pw-hint { font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }
.pw-error { font-size: 13px; color: #c42b1c; margin-top: 8px; }
.changelog-list { max-height: 400px; overflow-y: auto; }
.changelog-item { padding: 12px 0; border-bottom: 1px solid var(--border-default); }
.changelog-item:last-child { border-bottom: none; }
.changelog-header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.changelog-version { font-weight: 600; color: var(--text-primary); font-size: 14px; }
.changelog-date { font-size: 12px; color: var(--text-muted); }
.changelog-logs { list-style: disc; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.toggle-expand-enter-active { animation: toggle-in 0.25s cubic-bezier(0.1, 0.9, 0.2, 1); }
.toggle-expand-leave-active { animation: toggle-in 0.15s ease-in reverse; }
@keyframes toggle-in { from { opacity: 0; transform: translateY(-8px); max-height: 0; } to { opacity: 1; transform: translateY(0); max-height: 300px; } }

@media (max-width: 720px) {
  .settings-view { padding: 20px 16px 28px; }
  .setting-row { align-items: stretch; flex-direction: column; gap: 8px; }
  .setting-row:has(> .fluent-toggle) { align-items: center; flex-direction: row; }
  .setting-row > .fluent-select-wrapper,
  .setting-row > .scale-control,
  .setting-row > .color-picker-row,
  .setting-row > .uri-setting-actions,
  .setting-row > .update-actions { width: 100%; min-width: 0; }
  .setting-row :deep(.fluent-select) { width: 100% !important; min-width: 0 !important; }
  .scale-input-wrap, .hex-color-input { width: 100%; max-width: 100%; box-sizing: border-box; }
  .floating-text-input { width: 100%; max-width: 100%; box-sizing: border-box; }
  .uri-setting-row { align-items: flex-start; flex-direction: column; }
  .uri-setting-actions { width: 100%; justify-content: space-between; }
  .uri-route-grid { grid-template-columns: 1fr; }
  .uri-parameter-row { grid-template-columns: 1fr; gap: 4px; }
}

.update-actions {
  display: flex;
  gap: 8px;
}

.update-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin: 8px 0;
  background: var(--accent-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--accent-100);
}

.dark .update-info {
  background: rgba(234, 94, 193, 0.1);
  border-color: rgba(234, 94, 193, 0.2);
}

.update-info-content {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--accent);
}

.update-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.update-version {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.update-version-num {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-num);
}

.setting-note {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
  padding: 0 4px;
}

.update-success {
  color: #0f7b0f;
}

.performance-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-muted);
}

.performance-note svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.download-progress {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}

/* Cyreneの罗盘 推荐提示 */
.compass-invite-body { display: flex; flex-direction: column; gap: 14px; }
.compass-invite-hero { display: flex; align-items: center; gap: 16px; }
.compass-invite-logo { width: 72px; height: 72px; border-radius: var(--radius-lg); object-fit: contain; flex-shrink: 0; }
.compass-invite-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.compass-invite-title { margin: 0; font-size: 17px; font-weight: 600; color: var(--text-primary); display: flex; align-items: baseline; gap: 8px; }
.compass-invite-en { font-size: 12px; font-weight: 500; color: var(--text-muted); }
.compass-invite-desc { margin: 0; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
.compass-invite-slogan { margin: 0; font-size: 13px; line-height: 1.6; color: var(--text-secondary); padding: 10px 14px; background: var(--accent-50); border: 1px solid var(--accent-100); border-radius: var(--radius-md); }

/* Cyreneの罗盘 下载列表 */
.compass-download-body { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.compass-download-toolbar { display: flex; align-items: center; gap: 10px; }
.compass-download-hint { font-size: 12px; color: var(--text-muted); }
.compass-download-status { display: flex; align-items: center; gap: 10px; padding: 24px 8px; color: var(--text-muted); font-size: 13px; justify-content: center; }
.compass-download-status.compass-error { color: var(--text-secondary); }
.compass-release-list { display: flex; flex-direction: column; gap: 10px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
.compass-release { padding: 12px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--bg-subtle); display: flex; flex-direction: column; gap: 8px; }
.compass-release-head { display: flex; align-items: center; gap: 10px; }
.compass-release-tag { font-family: var(--font-num); font-size: 14px; font-weight: 600; color: var(--accent); }
.compass-release-date { font-size: 11px; color: var(--text-muted); }
.compass-release-name { margin: 0; font-size: 13px; color: var(--text-secondary); }
.compass-asset-list { display: flex; flex-direction: column; gap: 8px; }
.compass-asset { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; background: var(--bg-card-solid); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
.compass-asset-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.compass-asset-name { font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.compass-asset-size { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
</style>
