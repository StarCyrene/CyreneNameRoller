<template>
  <div class="contributors-view">
    <div class="contributors-header">
      <FluentButton variant="subtle" size="sm" icon-only @click="router.back()">
        <FluentIcon icon="arrow-left-16-regular" :width="18" />
      </FluentButton>
      <FluentIcon icon="people-team-24-regular" :width="22" />
      <h1 class="page-title">{{ lang === 'en' ? 'Contributors' : '贡献人员' }}</h1>
    </div>

    <div class="contributors-grid">
      <FluentCard v-for="c in contributors" :key="c.github" class="contributor-card">
        <img :src="c.avatar" :alt="c.name" class="contributor-avatar" />
        <div class="contributor-info">
          <h3 class="contributor-name">{{ c.name }}</h3>
          <p class="contributor-alias">{{ c.alias }}</p>
          <div class="contributor-roles">
            <span v-for="role in c.roles" :key="role" class="role-badge">{{ role }}</span>
          </div>
          <a href="#" @click.prevent="openLink(`https://github.com/${c.github}`)" class="contributor-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
        </div>
      </FluentCard>
    </div>

    <FluentCard class="attribution-card">
      <h3 class="attr-title">
        <FluentIcon icon="shield-16-regular" :width="16" />
        {{ lang === 'en' ? 'Third-Party Resources' : '非商用资源引用声明' }}
      </h3>
      <p class="attr-text">
        {{ lang === 'en'
          ? 'This application uses game resources from Honkai: Star Rail. All related copyrights belong to miHoYo/HoYoverse. This project is non-commercial and for educational purposes only.'
          : '本应用使用了来自崩坏：星穹铁道的游戏资源，相关版权归 miHoYo/HoYoverse 所有。本项目为非商业用途，仅供学习交流。' }}
      </p>
      <p class="attr-text attr-text-secondary">
        {{ lang === 'en'
          ? 'Additional languages use translate.js (MIT). The library is bundled with the application and verified by SHA-256; it is never loaded from a CDN.'
          : '额外语言使用 translate.js（MIT 协议），随应用本地打包并以 SHA-256 校验，不从 CDN 加载。' }}
      </p>
    </FluentCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { openExternal } from '../utils/openExternal'

const router = useRouter()
const settingsStore = useSettingsStore()
const lang = computed(() => settingsStore.settings.language)

function openLink(url) { openExternal(url) }

const contributors = [
  {
    github: 'Cyrene2008',
    name: 'Cyrene2008',
    alias: '星海昔涟',
    roles: ['Main Idea', 'Code', 'Design'],
    avatar: './avatars/Cyrene2008.png'
  },
  {
    github: 'LeafS825',
    name: 'LeafS825',
    alias: '叶背影',
    roles: ['Idea', 'Code', 'Design'],
    avatar: './avatars/LeafS825.png'
  }
]
</script>

<style scoped>
.contributors-view { padding: 32px; }
.contributors-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.page-title { font-family: var(--font-display); font-size: 24px; font-weight: 700; color: var(--text-primary); }

.contributors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.contributor-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.contributor-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-hover);
}

.contributor-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.contributor-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.contributor-alias {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.contributor-roles {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.role-badge {
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-50);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 600;
}

.contributor-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.contributor-link:hover {
  color: var(--accent);
}

.attribution-card { padding: 20px; }
.attr-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px; }
.attr-text { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 0; }
.attr-text-secondary { margin-top: 8px; }
</style>
