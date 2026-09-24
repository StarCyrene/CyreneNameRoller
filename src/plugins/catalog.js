import { pluginSourceCandidates } from './constants'

export function repositorySlug(repository) {
  const value = typeof repository === 'string' ? repository : repository?.url
  if (!value) return ''
  const short = value.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (short) return `${short[1]}/${short[2].replace(/\.git$/i, '')}`
  const github = value.match(/github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?(?:[#/].*)?$/i)
  return github ? `${github[1]}/${github[2]}` : ''
}

export function versionFromReleaseTag(tag) {
  const match = String(tag || '').trim().match(/^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/)
  if (!match) throw new Error(`Release 标签不是受支持的版本号：${tag || '空'}`)
  return match[1]
}

function wildcardPattern(pattern) {
  const escaped = String(pattern || '*.cnrp')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

export function selectReleaseAsset(release, pattern = '*.cnrp') {
  const matcher = wildcardPattern(pattern)
  const matches = (release?.assets || []).filter(asset => asset?.state === 'uploaded' && matcher.test(asset.name || ''))
  if (!matches.length) throw new Error(`Release ${release?.tag_name || ''} 中没有匹配 ${pattern} 的插件包`)
  if (matches.length === 1) return matches[0]
  const version = versionFromReleaseTag(release?.tag_name)
  const versionMatches = matches.filter(asset => String(asset.name).includes(version))
  if (versionMatches.length === 1) return versionMatches[0]
  throw new Error(`Release ${release?.tag_name || ''} 中有多个匹配 ${pattern} 的插件包，请缩小 assetPattern`)
}

async function fetchReleaseJson(urls, fetchImpl) {
  const failures = []
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (response.ok) return await response.json()
      failures.push(`${url} → HTTP ${response.status}`)
    } catch (error) {
      failures.push(`${url} → ${error?.message || String(error)}`)
    }
  }
  throw new Error(`GitHub Release 获取失败：${failures.join('；') || '没有可用地址'}`)
}

export async function resolveCatalogRelease(item, { source = 'cyrene', fetchImpl = fetch } = {}) {
  const config = item?.release
  if (!config) return { ...item }
  if ((config.provider || 'github') !== 'github') throw new Error(`不支持的插件 Release 提供方：${config.provider}`)
  if ((config.channel || 'latest') !== 'latest') throw new Error(`不支持的插件 Release 通道：${config.channel}`)
  const slug = repositorySlug(item.repository)
  if (!slug) throw new Error(`${item.name || item.id} 缺少有效的 GitHub 仓库`)
  const apiUrl = `https://api.github.com/repos/${slug}/releases/latest`
  try {
    const release = await fetchReleaseJson(pluginSourceCandidates(apiUrl, source), fetchImpl)
    if (release.draft || release.prerelease) throw new Error(`${item.name || item.id} 的最新 Release 不是正式版本`)
    const version = versionFromReleaseTag(release.tag_name)
    const asset = selectReleaseAsset(release, config.assetPattern || '*.cnrp')
    const digest = String(asset.digest || '')
    const sha256 = digest.startsWith('sha256:') ? digest.slice(7).toLowerCase() : ''
    if (!asset.browser_download_url) throw new Error(`${item.name || item.id} 的 Release 资源缺少下载地址`)
    return {
      ...item,
      version,
      downloadUrl: asset.browser_download_url,
      sha256: sha256 || item.sha256 || '',
      release: {
        ...config,
        tag: release.tag_name,
        name: release.name || release.tag_name,
        url: release.html_url || '',
        publishedAt: release.published_at || '',
        assetName: asset.name
      },
      releaseNotes: release.body || ''
    }
  } catch (error) {
    // 目录钉死的 version/downloadUrl 作为离线/限流/CORS 失败时的回退，仍可安装
    if (item.version && item.downloadUrl) {
      return {
        ...item,
        release: {
          ...config,
          tag: `v${item.version}`,
          name: `v${item.version}`,
          pinned: true
        },
        releaseNotes: item.releaseNotes || '',
        releaseError: ''
      }
    }
    throw error
  }
}

export async function fetchRepositoryOwner(item, { source = 'cyrene', fetchImpl = fetch } = {}) {
  const slug = repositorySlug(item.repository)
  if (!slug) return null
  const apiUrl = `https://api.github.com/repos/${slug}`
  let response = null
  for (const url of pluginSourceCandidates(apiUrl, source)) {
    try {
      const attempt = await fetchImpl(url, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (attempt.ok) {
        response = attempt
        break
      }
    } catch (error) {
      response = null
    }
  }
  if (!response) return null
  const repository = await response.json()
  return {
    author: repository.owner?.login || '',
    icon: repository.owner?.avatar_url || ''
  }
}
