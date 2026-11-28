import { compressBytes, decompressBytes, MAX_JSON_BYTES } from './dataCodec.ts'
import {
  decryptCompressedQRBackup, decryptCyreneBytes, encryptCompressedQRBackup, encryptCyreneBytes,
  isCompressedQRBackup
} from './cyreneCrypto.js'

export async function convertQRBackup(direction, bytes) {
  if (direction === 'send') {
    if (bytes.length > MAX_JSON_BYTES + 36) throw new Error('数据超过二维码传输上限，请改用文件导入和导出。')
    // Preserve exact JSON bytes, including native signed data and u64 values.
    return encryptCompressedQRBackup(compressBytes(await decryptCyreneBytes(bytes)))
  }
  if (direction === 'receive') {
    // Older streams contained the original .cyrene file bytes.
    if (!isCompressedQRBackup(bytes)) return bytes
    return encryptCyreneBytes(decompressBytes(await decryptCompressedQRBackup(bytes)))
  }
  throw new Error('无效的备份转换操作 / Invalid backup operation')
}
