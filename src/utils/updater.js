import { ref } from 'vue'
import { APP_VERSION } from './version'
import { tauriAPI, isTauri } from './tauriAPI'
import { useSettingsStore } from '../stores/settings'
import { getUpdatePlatformId } from './desktopRuntime.js'
import { findPlatformAsset as findUpdateAsset } from './updateAsset.mjs'

const GITHUB_REPO = 'StarCyrene/CyreneNameRoller'
const GHPROXY_BASE = 'https://gh.昔涟.cn/'
const FALLBACK_URLS = [
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  // api.kkgithub.com 已不可达；改用实测可用的 gh-proxy 镜像代理 GitHub API。
  `https://v4.gh-proxy.com/https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://gh-proxy.com/https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
]

export const updateState = ref({
  available: false,
  checking: false,
  downloading: false,
  downloadProgress: 0,
  version: '',
  url: '',
  fileName: '',
  fileSize: 0,
  body: '',
  error: null
})

export function getPlatform() {
  return getUpdatePlatformId()
}

export function findPlatformAsset(assets, platform = getPlatform(), version = '') {
  return findUpdateAsset(assets, platform, version)
}

function normalizeVersion(v) {
  return v.replace(/^v/i, '').trim()
}

function getDownloadUrl(originalUrl) {
  if (!originalUrl) return ''
  const source = useSettingsStore().settings.downloadSource || 'cyrene'
  if (source === 'github') return originalUrl
  return `${source === 'ghproxy' ? 'https://v4.gh-proxy.com/' : GHPROXY_BASE}${originalUrl}`
}

export { getDownloadUrl }

function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export async function fetchRelease() {
  if (isTauri()) {
    const data = await tauriAPI.checkUpdate()
    if (data) return data
    throw new Error('tauri update check failed')
  }
  for (const url of FALLBACK_URLS) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      try {
        const resp = await fetch(url, {
          headers: { 'Accept': 'application/vnd.github.v3+json' },
          signal: ctrl.signal
        })
        if (resp.ok) {
          const data = await resp.json()
          // 镜像偶尔会返回 200 的错误页/限流 JSON，没有 tag_name 就不算成功。
          if (data?.tag_name) return data
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {}
  }
  throw new Error('all sources failed')
}

export async function checkForUpdates(silent = true, bannerFn = null) {
  if (updateState.value.checking || updateState.value.downloading) return
  updateState.value.checking = true
  updateState.value.error = null

  let release = null
  try {
    release = await fetchRelease()
  } catch {}

  if (!release) {
    updateState.value = { available: false, checking: false, downloading: false, downloadProgress: 0, version: '', url: '', fileName: '', body: '', error: '无法连接到更新服务器' }
    if (bannerFn) bannerFn({ message: '无法连接到更新服务器', icon: 'warning-16-regular', type: 'warning', duration: 3000 })
    return
  }

  const remoteVersion = normalizeVersion(release.tag_name)
  const currentVersion = normalizeVersion(APP_VERSION)

  if (compareVersions(remoteVersion, currentVersion) > 0) {
    const platform = getPlatform()
    const assets = release.assets || []
    const targetAsset = findPlatformAsset(assets, platform, remoteVersion)
    updateState.value = {
      available: true, checking: false, downloading: false, downloadProgress: 0,
      version: release.tag_name,
      url: targetAsset ? targetAsset.browser_download_url : release.html_url,
      fileName: targetAsset ? targetAsset.name : '',
      fileSize: targetAsset ? targetAsset.size : 0,
      body: release.body || '', error: null
    }
    if (bannerFn) {
      const sizeMB = targetAsset ? (targetAsset.size / 1024 / 1024).toFixed(1) : ''
      const sizeText = sizeMB ? ` (${sizeMB} MB)` : ''
      bannerFn({
        message: `发现新版本 ${release.tag_name}${sizeText}`,
        icon: 'arrow-download-16-regular',
        type: 'info',
        duration: 0,
        dismissible: true
      })
    }
  } else {
    updateState.value = { available: false, checking: false, downloading: false, downloadProgress: 0, version: '', url: '', fileName: '', body: '', error: null }
    if (!silent && bannerFn) {
      bannerFn({ message: '已是最新版本', icon: 'checkmark-circle-16-regular', type: 'success', duration: 8000 })
    }
  }
}

export async function downloadUpdate(bannerFn = null) {
  if (!updateState.value.url) return

  const originalUrl = updateState.value.url
  const fileName = updateState.value.fileName
  const expectedSize = Number(updateState.value.fileSize) || 0
  const source = useSettingsStore().settings.downloadSource || 'cyrene'
  const downloadUrl = getDownloadUrl(originalUrl)

  if (!isTauri()) {
    window.open(downloadUrl, '_blank')
    return
  }

  if (!fileName || !/\.(exe|deb|appimage)$/i.test(fileName)) {
    await tauriAPI.openExternal(originalUrl)
    return
  }

  updateState.value.downloading = true
  updateState.value.downloadProgress = 0

  let bannerHandle = null
  if (bannerFn) {
    bannerHandle = bannerFn({
      message: `正在下载新版本: ${updateState.value.version}`,
      icon: 'arrow-download-16-regular',
      type: 'download',
      duration: 0,
      dismissible: false,
      progress: 0
    })
  }

  let removeProgressListener = null
  try {
    let result
    if (isTauri()) {
      const { listen } = await import('@tauri-apps/api/event')
      removeProgressListener = await listen('update-download-progress', event => {
        const progress = Math.max(0, Math.min(99, Number(event.payload) || 0))
        updateState.value.downloadProgress = progress
        if (bannerHandle) bannerHandle.update({ progress })
      })
      result = await tauriAPI.downloadAndLaunchUpdate(originalUrl, fileName, expectedSize, source)
    }

    if (!result?.success) throw new Error(result?.error || '原生更新程序未能启动')

    updateState.value.downloadProgress = 100
    if (bannerHandle) {
      bannerHandle.update({ message: '安装程序已验证并启动，应用即将退出', icon: 'checkmark-circle-16-regular', type: 'success', progress: 100, duration: 8000 })
    }
  } catch (error) {
    console.error('Download failed:', error)
    updateState.value.downloadProgress = 0
    if (bannerHandle) {
      bannerHandle.update({ message: `更新失败：${error?.message || error}`, icon: 'warning-16-regular', type: 'warning', progress: 0, duration: 8000 })
    }
  } finally {
    if (typeof removeProgressListener === 'function') removeProgressListener()
    updateState.value.downloading = false
  }
}
