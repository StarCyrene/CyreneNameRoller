import { base64ToBytes, bytesToBase64, dataBridge } from './dataBridge.js'
import { useNamesStore } from '../stores/names.js'
import { usePrizesStore } from '../stores/prizes.js'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' && value.trim().length > 0
const optionalText = value => value == null || typeof value === 'string'
const id = value => text(value) && !Object.prototype.hasOwnProperty.call(Object.prototype, value) && value !== 'prototype'
const optionalId = value => value == null || value === '' || id(value)
const invalid = () => new Error('无效的同步数据 / Invalid sync data')

async function convertBackup(direction, bytes) {
  if (typeof Worker === 'undefined') {
    const { convertQRBackup } = await import('./qrBackupCodec.js')
    return convertQRBackup(direction, bytes)
  }
  const worker = new Worker(new URL('../workers/qrBackup.worker.js', import.meta.url), { type: 'module' })
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.output)
      worker.onerror = worker.onmessageerror = () => reject(new Error('备份处理失败 / Could not process backup'))
      worker.postMessage({ direction, bytes }, [bytes.buffer])
    })
  } finally {
    worker.terminate()
  }
}

// Compare with the local data-management password used by Settings. Reload
// at the point of action so a stale form cannot authorize a changed password.
async function authorizeBackup({ password, setPassword = false } = {}) {
  if (typeof password !== 'string' || !password.length) throw new Error('请输入数据操作密码 / Enter the data password')
  const current = await dataBridge.loadDataPassword()
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
  if (!current && setPassword) return dataBridge.save('password', { hash })
  if (hash !== current) throw new Error('数据操作密码错误 / Incorrect data password')
}

export function validateQRPayload(payload) {
  if (!object(payload) || payload.version !== 1) throw invalid()
  const { kind, data } = payload
  if (kind === 'backup') {
    // Recognize both CYRENE1 and the compressed CYRQRB1 QR envelope.
    if (typeof data !== 'string' || data.length < 48 || data.length % 4 ||
      !/^Q1lS(?:RU5F|UVJC)MQ[A-D][A-Za-z0-9+/]+={0,2}$/.test(data)) throw invalid()
    return payload
  }
  if (!object(data) || !text(data.name) || !optionalId(data.id)) throw invalid()
  if (kind === 'names') {
    if (!Array.isArray(data.names) || !data.names.every(p => object(p) && text(p.cn) && optionalId(p.id) &&
      optionalText(p.en) && optionalId(p.groupId) && (p.isWhiteList == null || typeof p.isWhiteList === 'boolean')) ||
      (data.groups != null && (!Array.isArray(data.groups) || !data.groups.every(g =>
        object(g) && id(g.id) && text(g.name) && optionalText(g.enName)))) ||
      (data.whiteList != null && (!Array.isArray(data.whiteList) || !data.whiteList.every(w => text(w) || (object(w) && text(w.cn)))))) throw invalid()
  } else if (kind === 'prizes') {
    if (!Array.isArray(data.prizes) || !data.prizes.every(p => object(p) && text(p.name) &&
      optionalId(p.id) && optionalText(p.quality) &&
      Number.isSafeInteger(p.quantity) && p.quantity >= 0 && Number.isFinite(p.weight) && p.weight > 0)) throw invalid()
  } else throw invalid()
  return payload
}

export async function createQRPayload(kind, access) {
  let data
  if (kind === 'backup') {
    await authorizeBackup(access)
    data = bytesToBase64(await convertBackup('send', await dataBridge.exportDataBytes()))
  } else if (kind === 'names' || kind === 'prizes') {
    const store = kind === 'names' ? useNamesStore() : usePrizesStore()
    await store.initialize()
    // Snapshot once; editing an active list cannot change a running stream.
    data = JSON.parse(JSON.stringify(kind === 'names' ? store.currentList : store.current))
  } else throw invalid()
  return validateQRPayload({ version: 1, kind, data })
}

export async function importQRPayload(payload, access) {
  const { kind, data } = validateQRPayload(payload)
  if (kind === 'backup') {
    if (access?.replace !== true) throw new Error('需要确认替换本机数据 / Confirm replacement first')
    await authorizeBackup(access)
    const result = await dataBridge.importDataBytes(await convertBackup('receive', base64ToBytes(data)))
    if (!result?.success) throw new Error(result?.error || '未能恢复程序数据 / Backup restore failed')
    return { route: '/lists', reload: true }
  }
  if (kind === 'names') {
    if (!await useNamesStore().importList(data)) throw invalid()
    return { route: '/lists' }
  }
  const result = await usePrizesStore().importList(data)
  if (!result?.success) throw new Error(result?.error || '未能保存奖品单 / Prize list was not saved')
  return { route: '/lottery/prizes' }
}
