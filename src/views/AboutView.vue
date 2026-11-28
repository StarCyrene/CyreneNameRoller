<template>
  <div class="about-view">
    <h1 class="page-title">
      <FluentIcon icon="info-24-regular" :width="28" />
      {{ t('about', lang) }}
    </h1>

    <FluentCard class="about-card">
      <div class="about-logo">
        <img src="/icon.png" alt="CyreneNameRoller" class="logo-img" />
      </div>

      <h2 class="app-name">{{ APP_NAME }}</h2>
      <p class="app-version">{{ APP_VERSION }}</p>
      <p class="app-desc">{{ lang === 'en' ? 'A random name picker with Fluent Design' : '一个采用 Fluent Design 的随机点名器' }}</p>

<div class="about-divider" />

      <!-- 作者信息框 + 组织信息（同一行，作者在前） -->
      <div class="about-identity">
        <div class="about-creator">
          <FluentPersonPicture :src="AUTHOR_AVATAR" :display-name="AUTHOR_NAME" :size="68" />
          <div class="about-creator-info">
            <div class="about-creator-name-row">
              <span class="about-creator-name">{{ AUTHOR_NAME }}</span>
              <span class="about-creator-role">{{ lang === 'en' ? 'Author' : '作者' }}</span>
            </div>
            <a href="#" class="about-github-link">
              <FluentIcon icon="code-20-regular" :width="20" />
              <span>GitHub</span>
            </a>
          </div>
        </div>

        <div class="about-identity-divider" />

        <div class="about-org">
        <img src="/starcyrene.ico" alt="StarCyrene" class="about-org-icon" />
        <div class="about-org-copy">
          <span class="about-org-name">星海昔涟 StarCyrene</span>
          <span>「以爱为因，星光成涟」♪</span>
          <span>Made with Love, Starlight Ripples On♪</span>
          <a href="#" @click.prevent="openLink('https://star.cyrene.hk')" class="about-org-site">
            <FluentIcon icon="globe-20-regular" :width="20" />
            <span>{{ lang === 'en' ? 'Team website' : '团队官网' }} star.cyrene.hk</span>
          </a>
        </div>
      </div>
      </div>

      <div class="about-divider" />

      <!-- Powered by VueFluentWidgets -->
      <div class="about-powered">
        <FluentIcon icon="code-20-regular" :width="20" />
        <div class="about-powered-copy">
          <a href="#" @click.prevent="openLink('https://fluent.cyrene.hk')" class="about-powered-name">Powered by VueFluentWidgets</a>
          <span>Fluent Design System for Vue · MIT License</span>
          <span>Copyright © 2025-2026 Cyrene2008</span>
          <a href="#" @click.prevent="openLink('https://fluent.cyrene.hk')" class="about-powered-link">
            <FluentIcon icon="globe-20-regular" :width="20" />
            <span>https://fluent.cyrene.hk</span>
          </a>
        </div>
      </div>

      <div class="about-divider" />

      <div class="about-section about-actions">
        <FluentButton variant="secondary" size="sm" @click="router.push('/about/contributors')">
          <FluentIcon icon="people-team-16-regular" :width="14" />
          {{ lang === 'en' ? 'Contributors' : '贡献人员' }}
        </FluentButton>
        <FluentButton v-if="pointerPreviewAvailable" variant="secondary" size="sm" class="pointer-replay" @click="replayPointerEffects">
          <FluentIcon icon="cursor-hover-20-regular" :width="16" />
          {{ pointerPlaying
            ? (lang === 'en' ? 'Stop pointer effects' : '停止指针特效')
            : (lang === 'en' ? 'Replay pointer effects' : '重播指针特效') }}
        </FluentButton>
      </div>

      <div class="about-section">
        <h3>{{ lang === 'en' ? 'Repository' : '仓库' }}</h3>
        <a href="#" @click.prevent="openLink('https://github.com/StarCyrene/CyreneNameRoller')">github.com/StarCyrene/CyreneNameRoller</a>
      </div>

      <div class="about-section">
        <h3>{{ lang === 'en' ? 'License' : '许可证' }}</h3>
        <p>GNU General Public License v3.0</p>
        <p class="license-note">
          {{ lang === 'en'
            ? 'The project’s own code is free software. Third-party components have their own terms.'
            : '本项目的原创代码是自由软件。第三方组件适用各自的许可条款。' }}
        </p>
        <details class="swarm-license">
          <summary>{{ lang === 'en' ? 'Swarm Cursors Vue · Credits and license terms' : 'Swarm Cursors Vue · 署名与许可说明' }}</summary>
          <pre translate="no">{{ swarmNotice }}{{ swarmLicense }}</pre>
        </details>
      </div>

      <div class="about-section">
        <h3>{{ lang === 'en' ? 'Copyright' : '版权声明' }}</h3>
        <p>Copyright &copy; 2025-2026 <a href="#" @click.prevent="openLink('https://github.com/Cyrene2008')">Cyrene2008</a>, All Rights Reserved.</p>
      </div>

      <div class="about-section">
        <p class="icp-link">
          <a href="https://icp.gov.moe/?keyword=20260093" target="_blank" rel="noopener">萌ICP备20260093号</a>
        </p>
      </div>
    </FluentCard>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { t } from '../utils/i18n'
import { APP_VERSION, APP_NAME } from '../utils/version'
import { openExternal } from '../utils/openExternal'
import { pointerEffectsKey } from '../composables/usePointerEffects'
import swarmLicense from '../../packages/swarm-cursors-vue/LICENSE?raw'
import swarmNotice from '../../packages/swarm-cursors-vue/NOTICE.md?raw'

const router = useRouter()
const settingsStore = useSettingsStore()
const lang = computed(() => settingsStore.settings.language)
const { available: pointerPreviewAvailable, playing: pointerPlaying, replay: replayPointerEffects } = inject(pointerEffectsKey, {})

const AUTHOR_NAME = 'Cyrene2008'
const AUTHOR_AVATAR = './avatars/Cyrene2008.png'

function openLink(url) { openExternal(url) }
</script>

<style scoped>
.about-view {
  padding: 32px;
}

.page-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.about-card {
  text-align: center;
}

.about-logo {
  margin-bottom: 16px;
}

.logo-img {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-4);
}

.app-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.app-version {
  font-size: 14px;
  color: var(--accent);
  margin-bottom: 8px;
}

.app-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.about-divider {
  height: 1px;
  background: var(--border-default);
  margin: 20px 0;
}

/* 作者信息框 + 组织信息 同一行 */
.about-identity {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  flex-wrap: wrap;
}

.about-identity-divider {
  width: 1px;
  height: 64px;
  background: var(--border-default);
}

/* 作者信息框（仿 demo Footer footer-creator） */
.about-creator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.about-creator-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.about-creator-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.about-creator-name {
  font-size: 19px;
  font-weight: 600;
  color: var(--text-primary);
}

.about-creator-role {
  color: var(--text-muted);
  font-size: 14px;
}

.about-github-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 15px;
  transition: color 0.2s ease;
}

.about-github-link:hover {
  color: var(--accent);
}

/* 组织信息（仿 demo Footer footer-org） */
.about-org {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
  font-size: 15px;
}

.about-org-icon {
  width: 68px;
  height: 68px;
  object-fit: contain;
  flex-shrink: 0;
}

.about-org-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.about-org-name {
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 600;
  text-decoration: none;
}

.about-org-site {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 14px;
  text-decoration: none;
  transition: color 0.2s ease;
}

.about-org-site:hover {
  color: var(--accent);
}

/* Powered by VueFluentWidgets */
.about-powered {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
  font-size: 15px;
}

.about-powered-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  font-size: 14px;
  color: var(--text-muted);
}

.about-powered-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
  transition: color 0.2s ease;
}

.about-powered-name:hover {
  color: var(--accent);
}

.about-powered-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 14px;
  text-decoration: none;
  transition: color 0.2s ease;
}

.about-powered-link:hover {
  color: var(--accent);
}

.about-section {
  margin-bottom: 16px;
  text-align: center;
}

.about-section h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.about-section p {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.about-section a {
  color: var(--accent);
  font-size: 14px;
}

.license-note {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.icp-link {
  margin-top: 8px;
}

.icp-link a {
  font-size: 12px;
  color: var(--text-muted);
}

.about-actions {
  margin: 16px 0;
}

@media (max-width: 560px) {
  .about-identity { flex-direction: column; gap: 16px; }
  .about-identity-divider { width: 60px; height: 1px; }
  .about-creator { flex-direction: row; gap: 12px; }
  .about-creator-info { align-items: flex-start; }
  .about-org { flex-direction: row; gap: 12px; }
  .about-org-copy { align-items: flex-start; }
  .about-powered { flex-direction: column; gap: 10px; }
  .about-powered-copy { align-items: center; }
}
.swarm-license { color: var(--text-secondary); font-size: 12px; }
.swarm-license summary { cursor: pointer; }
.swarm-license pre { white-space: pre-wrap; overflow-wrap: anywhere; text-align: start; user-select: text; }
</style>
