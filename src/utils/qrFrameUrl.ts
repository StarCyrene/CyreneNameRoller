export const QR_PRODUCT_URL = 'https://star.cyrene.hk/products/cyrenes-name-roller'
const prefix = QR_PRODUCT_URL + '#cnr-sync='

export function frameToProductUrl(frame: Uint8Array): string {
  // Keep roster bytes in the fragment, which is not sent in the HTTP request.
  const encoded = btoa(String.fromCharCode(...frame)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return prefix + encoded
}

export function frameFromProductUrl(text: string): Uint8Array | undefined {
  if (!text.startsWith(prefix)) return
  const encoded = text.slice(prefix.length)
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(encoded) || encoded.length % 4 === 1) return
  return Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}
