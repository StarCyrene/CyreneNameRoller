import jsQR from 'jsqr'
import { decodeData } from '../utils/dataCodec.ts'
import { createFrameDecoder } from '../utils/qrFountain.ts'
import { frameFromProductUrl } from '../utils/qrFrameUrl.ts'
import { loadRaptorQ } from '../utils/qrRaptor.ts'

const decoder = loadRaptorQ().then(createFrameDecoder)
self.onmessage = async ({ data }: MessageEvent<{pixels: ImageData}>) => {
  try {
    const { width, height, data: rgba } = data.pixels
    const qr = jsQR(rgba, width, height, { inversionAttempts: 'dontInvert' })
    const frame = qr && (frameFromProductUrl(qr.data) ||
      (qr.binaryData[0] === 67 && qr.binaryData[1] === 89 ? Uint8Array.from(qr.binaryData) : undefined))
    const update = frame && (await decoder).add(frame)
    if (!update) self.postMessage({ type: 'idle' })
    else if (!update.complete) self.postMessage({ type: 'progress', received: update.received, total: update.total })
    else self.postMessage({ type: 'complete', payload: decodeData(update.bytes), received: update.total, total: update.total })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '二维码解码失败，请重新扫码。' })
  }
}
