import { getDesktopPlatform, getUpdatePlatformId } from './desktopRuntime.js'

export const APP_VERSION = '26.3.0'
export const APP_VERSION_PREFIX = 'v'

function getBuildNumber() {
  const now = new Date()
  const utc8 = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset()) * 60 * 1000)
  const y = utc8.getFullYear()
  const m = String(utc8.getMonth() + 1).padStart(2, '0')
  const d = String(utc8.getDate()).padStart(2, '0')
  const h = String(utc8.getHours()).padStart(2, '0')
  return `${y}${m}${d}${h}`
}

function getPlatformSuffix() {
  const platform = getDesktopPlatform()
  if (platform.runtime === 'tauri' && !platform.desktop) return platform.os
  return getUpdatePlatformId(platform)
}

export const APP_BUILD = typeof __BUILD_HASH__ !== 'undefined'
  ? __BUILD_HASH__
  : getBuildNumber()

export const APP_PLATFORM = getPlatformSuffix()
export const APP_NAME = "Cyreneの随机点名器"
