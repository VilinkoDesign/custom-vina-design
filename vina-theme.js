// Neutral Light/Dark presets from VinaApp's theme tiles and
// VertexUI/VertexUI.Colors.h::VuiColorSystemInit. COLORREF channel order.
export function poggetTheme(dark) {
  const rgb = (value) => value * 0x010101,
    base = dark ? 10 : 255;
  const bright = (amount) => (base > 128 ? base - amount : base + amount);
  return {
    "pogget.theme.darknight": rgb(base),
    "pogget.theme.midnight": rgb(bright(10)),
    "pogget.theme.midnightplus": rgb(bright(30)),
    "pogget.theme.white": rgb(base < 128 ? 255 : 20),
    // Semantic names used by the current native Pogget_Std preset.
    "pogget.theme.bg": rgb(base),
    "pogget.theme.bgSubtle": rgb(bright(10)),
    "pogget.theme.bgSubtleStrong": rgb(bright(30)),
    "pogget.theme.text": rgb(base < 128 ? 255 : 20),
    "pogget.theme.darken": rgb(20),
    "pogget.theme.accent": 82 | (121 << 8) | (251 << 16),
    "pogget.theme.monochrome": true,
  };
}
