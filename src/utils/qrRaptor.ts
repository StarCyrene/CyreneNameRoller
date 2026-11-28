import init, { Encoder, Decoder } from 'raptorq/raptorq.js'
import wasmUrl from 'raptorq/raptorq_bg.wasm?url'
import type { RaptorRuntime } from './qrFountain.ts'

let runtime: Promise<RaptorRuntime | undefined> | undefined

// Some Android WebViews lack the WebAssembly i64 ↔ JS BigInt integration.
// Actually instantiate a decoder before advertising support. Raw and XOR frames
// remain interoperable between phones with and without this optional accelerator.
export function loadRaptorQ() {
  return runtime ??= (async () => {
    try {
      if (typeof WebAssembly === 'undefined' || typeof BigInt !== 'function') return
      await init(wasmUrl)
      Decoder.with_defaults(BigInt(192), 192).free()
      return { Encoder, Decoder }
    } catch { return undefined }
  })()
}
