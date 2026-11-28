const MAGIC = new TextEncoder().encode('CYRENE1\0')
const QR_MAGIC = new TextEncoder().encode('CYRQRB1\0')
const NONCE_LENGTH = 12
const KEY_MATERIAL = 'CyreneNameRoller:encrypted-data:v1:cn.cyrene2008.nameroller'

let cachedKey

async function getKey() {
  if (!cachedKey) {
    const material = new TextEncoder().encode(KEY_MATERIAL)
    const digest = await crypto.subtle.digest('SHA-256', material)
    cachedKey = crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }
  return cachedKey
}

export function isCompressedQRBackup(bytes) {
  return QR_MAGIC.every((byte, index) => bytes[index] === byte)
}

async function encryptBytes(plain, magic, authenticateMagic = false) {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH))
  const params = { name: 'AES-GCM', iv: nonce }
  if (authenticateMagic) params.additionalData = magic
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(params, await getKey(), plain))
  const output = new Uint8Array(magic.length + nonce.length + encrypted.length)
  output.set(magic)
  output.set(nonce, magic.length)
  output.set(encrypted, magic.length + nonce.length)
  return output
}

async function decryptBytes(input, magic, authenticateMagic = false) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const nonceEnd = magic.length + NONCE_LENGTH
  if (bytes.length <= nonceEnd + 16 || !magic.every((byte, index) => bytes[index] === byte)) {
    throw new Error('数据文件格式无效')
  }
  try {
    const params = { name: 'AES-GCM', iv: bytes.subarray(magic.length, nonceEnd) }
    if (authenticateMagic) params.additionalData = magic
    return new Uint8Array(await crypto.subtle.decrypt(params, await getKey(), bytes.subarray(nonceEnd)))
  } catch {
    throw new Error('数据完整性校验失败，文件可能已被篡改')
  }
}

export const encryptCyreneBytes = bytes => encryptBytes(bytes, MAGIC)
export const decryptCyreneBytes = bytes => decryptBytes(bytes, MAGIC)
export const encryptCompressedQRBackup = bytes => encryptBytes(bytes, QR_MAGIC, true)
export const decryptCompressedQRBackup = bytes => decryptBytes(bytes, QR_MAGIC, true)

export async function encryptCyreneData(value) {
  return encryptCyreneBytes(new TextEncoder().encode(JSON.stringify(value)))
}

export async function decryptCyreneData(input) {
  const bytes = await decryptCyreneBytes(input)
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('数据内容无效')
    return value
  } catch {
    throw new Error('数据完整性校验失败，文件可能已被篡改')
  }
}
