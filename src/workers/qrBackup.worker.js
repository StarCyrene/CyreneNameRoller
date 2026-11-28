import { convertQRBackup } from '../utils/qrBackupCodec.js'

self.onmessage = async ({ data: { direction, bytes } }) => {
  try {
    const output = await convertQRBackup(direction, bytes)
    self.postMessage({ output }, [output.buffer])
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) })
  }
}
