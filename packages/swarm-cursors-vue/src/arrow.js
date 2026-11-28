// A folded paper dart. The tip stays sharp at the shared hotspot (4.5, 2.5);
// the two rounded wings meet at a single inward fold, with no shaft.
export const ARROW = "M4.5 2.5 Q4.8 2.3 5.45 2.78 L20.45 13.15 Q21.65 14.02 20.15 14.45 L13.55 15.52 Q12.76 15.66 12.32 16.3 L8.63 21.52 Q7.85 22.52 7.53 20.98 L4.26 3.56 Q4.09 2.75 4.5 2.5 Z";

// Flat SVG works as an OS cursor as well as an inline drawing tool. A hairline
// catches dark surfaces; the ink rim still defines the tip over white.
export function arrowArtwork(fill) {
  return `<path d="${ARROW}" fill="${fill}" stroke="#302634" stroke-width="1.85" stroke-linejoin="round"/>` +
    '<path d="M5.24 3.65 12.85 15.45 20.18 13.78Z" fill="white" opacity=".36"/>' +
    '<path d="M5.24 3.65 8.11 20.63 12.85 15.45Z" fill="#301735" opacity=".13"/>' +
    `<path d="${ARROW}" fill="none" stroke="white" stroke-opacity=".93" stroke-width=".75" stroke-linejoin="round"/>`;
}
