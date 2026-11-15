// Official Font Awesome Free 6 icons, bundled locally as an SVG sprite.
const sprite = new URL("./vendor/fontawesome/fa6.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
export const COMPONENT_ICONS = {
  rect: "regular-square",
  rectangle: "regular-square",
  solid: "square",
  glass: "braille",
  text: "font",
  icon: "icons",
  image: "image",
  button: "hand-pointer",
  group: "object-group",
  path: "pen-nib",
  content: "file-lines",
  container: "layer-group",
};

// The native Vina renderer embeds Solid FA6 glyphs as :\uFxxx: tokens. Keep
// the browser editor on the same representation so exported text is rendered
// identically by Pogget and can be edited without remembering code points.
export const FA6_ICONS = [
  ["arrow-up", "\uf062", "向上"],
  ["arrow-down", "\uf063", "向下"],
  ["arrow-left", "\uf060", "向左"],
  ["arrow-right", "\uf061", "向右"],
  ["arrow-up-right-from-square", "\uf35d", "打开"],
  ["chevron-up", "\uf077", "上箭头"],
  ["chevron-down", "\uf078", "下箭头"],
  ["chevron-left", "\uf053", "左箭头"],
  ["chevron-right", "\uf054", "右箭头"],
  ["caret-down", "\uf0d7", "展开"],
  ["xmark", "\uf00d", "关闭"],
  ["check", "\uf00c", "完成"],
  ["plus", "\uf067", "添加"],
  ["minus", "\uf068", "减少"],
  ["ellipsis", "\uf141", "更多"],
  ["ellipsis-vertical", "\uf142", "更多操作"],
  ["gear", "\uf013", "设置"],
  ["magnifying-glass", "\uf002", "搜索"],
  ["house", "\uf015", "主页"],
  ["floppy-disk", "\uf0c7", "保存"],
  ["folder-open", "\uf07c", "打开文件夹"],
  ["download", "\uf019", "下载"],
  ["upload", "\uf093", "上传"],
  ["pen", "\uf304", "编辑"],
  ["pen-nib", "\uf56b", "路径"],
  ["trash", "\uf2ed", "删除"],
  ["copy", "\uf0c5", "复制"],
  ["link", "\uf0c1", "链接"],
  ["play", "\uf04b", "播放"],
  ["pause", "\uf04c", "暂停"],
  ["circle-info", "\uf05a", "信息"],
  ["question", "\uf128", "帮助"],
  ["heart", "\uf004", "喜欢"],
  ["star", "\uf005", "收藏"],
  ["bolt", "\uf0e7", "闪电"],
  ["palette", "\uf53f", "颜色"],
  ["sliders", "\uf1de", "调节"],
  ["eye", "\uf06e", "显示"],
  ["eye-slash", "\uf070", "隐藏"],
  ["lock", "\uf023", "锁定"],
  ["lock-open", "\uf3c1", "解锁"],
  ["bars", "\uf0c9", "菜单"],
  ["arrow-pointer", "\uf245", "指针"],
  ["hand-pointer", "\uf25a", "点击"],
  ["object-group", "\uf247", "编组"],
  ["object-ungroup", "\uf248", "解组"],
  ["layer-group", "\uf5fd", "图层"],
  ["font", "\uf031", "字体"],
  ["image", "\uf03e", "图片"],
  ["icons", "\uf86d", "图标"],
  ["square", "\uf0c8", "方形"],
  ["circle", "\uf111", "圆形"],
  ["triangle-exclamation", "\uf071", "警告"],
];

export const FA6_BY_NAME = new Map(
  FA6_ICONS.map(([name, glyph, label]) => [name, { name, glyph, label }]),
);

export function fa6Token(glyph) {
  return `:${glyph}:`;
}

export function fa6Tokens(text) {
  const value = String(text ?? "");
  const result = [];
  const token = /:([\uE000-\uF8FF]):/gu;
  let match;
  while ((match = token.exec(value))) {
    result.push({ start: match.index, end: token.lastIndex, glyph: match[1] });
  }
  return result;
}

export function fa6Glyph(glyph) {
  const span = document.createElement("span");
  span.className = "vina-fa-glyph";
  span.textContent = glyph;
  span.setAttribute("aria-hidden", "true");
  return span;
}

// Render both native :\uFxxx: tokens and direct PUA characters. The latter is
// retained for compatibility with existing presets and icon objects.
export function renderFa6Text(container, value) {
  container.replaceChildren();
  const text = String(value ?? "");
  const token = /:([\uE000-\uF8FF]):/gu;
  let cursor = 0;
  let match;
  while ((match = token.exec(text))) {
    if (match.index > cursor)
      appendFa6Plain(container, text.slice(cursor, match.index));
    const glyph = fa6Glyph(match[1]);
    glyph.classList.add("vina-fa-token");
    glyph.dataset.tokenStart = String(match.index);
    glyph.dataset.tokenEnd = String(token.lastIndex);
    glyph.dataset.glyph = match[1];
    container.append(glyph);
    cursor = token.lastIndex;
  }
  if (cursor < text.length) appendFa6Plain(container, text.slice(cursor));
  return container;
}

function appendFa6Plain(container, value) {
  let cursor = 0;
  for (let i = 0; i < value.length; ) {
    const code = value.codePointAt(i);
    const size = code > 0xffff ? 2 : 1;
    if (code >= 0xe000 && code <= 0xf8ff) {
      if (i > cursor) container.append(document.createTextNode(value.slice(cursor, i)));
      container.append(fa6Glyph(String.fromCodePoint(code)));
      i += size;
      cursor = i;
    } else i += size;
  }
  if (cursor < value.length) container.append(document.createTextNode(value.slice(cursor)));
}

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "fa-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.dataset.icon = name;
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${sprite}#fa-${name}`);
  svg.append(use);
  return svg;
}
