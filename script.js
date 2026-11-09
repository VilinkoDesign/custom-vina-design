"use strict";

const STORAGE_KEY = 'customvina.state.v1';

const TYPE_NAMES = {
  rect: 'Rect', solid: 'Solid', glass: 'Glass',
  text: 'Text', icon: 'Icon', image: 'Image',
  button: 'Button', group: 'Group'
};

/* =========================================================
   内部动作（62 个）
   ========================================================= */
const ACTIONS = [
  { value: '', label: '（无）' },

  { value: 'pogget.action.view.toggle',                  label: 'view.toggle（切换视图）' },
  { value: 'pogget.action.view.list',                    label: 'view.list（列表视图）' },
  { value: 'pogget.action.view.grid',                    label: 'view.grid（图标视图）' },
  { value: 'pogget.action.listViewMenu',                 label: 'listViewMenu（列表视图）' },
  { value: 'pogget.action.iconViewMenu',                 label: 'iconViewMenu（图标视图）' },

  { value: 'pogget.action.container.lock',               label: 'container.lock（布局锁定）' },
  { value: 'pogget.action.container.personalization',    label: 'container.personalization（个性化）' },
  { value: 'pogget.action.container.collapse',           label: 'container.collapse（折叠）' },
  { value: 'pogget.action.container.expand',             label: 'container.expand（展开）' },
  { value: 'pogget.action.container.toggleCollapse',     label: 'container.toggleCollapse（折叠/展开）' },
  { value: 'pogget.action.container.menu',               label: 'container.menu（收纳盒菜单）' },
  { value: 'pogget.action.container.tagMenu',            label: 'container.tagMenu（标签菜单）' },
  { value: 'pogget.action.container.searchMenu',         label: 'container.searchMenu（搜索选项）' },
  { value: 'pogget.action.container.hoverCollapse',      label: 'container.hoverCollapse（悬停折叠）' },
  { value: 'pogget.action.container.pin',                label: 'container.pin（固定）' },
  { value: 'pogget.action.container.endTemporarySession',label: 'container.endTemporarySession（结束临时会话）' },

  { value: 'pogget.action.container.inlineBack',         label: 'container.inlineBack（内联后退）' },
  { value: 'pogget.action.container.exitInlineSearch',   label: 'container.exitInlineSearch（退出内联搜索）' },
  { value: 'pogget.action.container.inlineHome',         label: 'container.inlineHome（内联主页）' },
  { value: 'pogget.action.container.inlineSave',         label: 'container.inlineSave（保存）' },
  { value: 'pogget.action.container.inlineOpen',         label: 'container.inlineOpen（外部打开）' },
  { value: 'pogget.action.container.toggleInlineSearch', label: 'container.toggleInlineSearch（内联搜索）' },

  { value: 'pogget.action.mergedHostUseVerticalLayout',  label: 'mergedHostUseVerticalLayout（纵向布局）' },
  { value: 'pogget.action.mergedHostUseTabLayout',       label: 'mergedHostUseTabLayout（标签页布局）' },
  { value: 'pogget.action.alwaysOnTopMenu',              label: 'alwaysOnTopMenu（置顶层）' },
  { value: 'pogget.action.normalLayerMenu',              label: 'normalLayerMenu（普通层）' },
  { value: 'pogget.action.sendToBackMenu',               label: 'sendToBackMenu（底层）' },

  { value: 'pogget.action.spacingCompact',               label: 'spacingCompact（紧凑间距）' },
  { value: 'pogget.action.spacingStandard',              label: 'spacingStandard（标准间距）' },
  { value: 'pogget.action.spacingLoose',                 label: 'spacingLoose（宽松间距）' },
  { value: 'pogget.action.spacingPaged',                 label: 'spacingPaged（分页布局）' },
  { value: 'pogget.action.spacingFixed',                 label: 'spacingFixed（固定间距）' },
  { value: 'pogget.action.spacingDynamic',               label: 'spacingDynamic（动态间距）' },
  { value: 'pogget.action.iconSpacingMenu',              label: 'iconSpacingMenu（间距菜单）' },

  { value: 'pogget.action.sortFree',                     label: 'sortFree（自由排序）' },
  { value: 'pogget.action.sortNameAsc',                  label: 'sortNameAsc（名称正序）' },
  { value: 'pogget.action.sortNameDesc',                 label: 'sortNameDesc（名称倒序）' },
  { value: 'pogget.action.sortTimeAsc',                  label: 'sortTimeAsc（时间正序）' },
  { value: 'pogget.action.sortTimeDesc',                 label: 'sortTimeDesc（时间倒序）' },
  { value: 'pogget.action.sortExtAsc',                   label: 'sortExtAsc（扩展名正序）' },
  { value: 'pogget.action.sortExtDesc',                  label: 'sortExtDesc（扩展名倒序）' },
  { value: 'pogget.action.sortSizeAsc',                  label: 'sortSizeAsc（大小正序）' },
  { value: 'pogget.action.sortSizeDesc',                 label: 'sortSizeDesc（大小倒序）' },
  { value: 'pogget.action.sortFreeGrid',                 label: 'sortFreeGrid（自由网格）' },
  { value: 'pogget.action.sortMenu',                     label: 'sortMenu（排序菜单）' },

  { value: 'pogget.action.unlockLayoutMenu',             label: 'unlockLayoutMenu（解除锁定）' },
  { value: 'pogget.action.lockLayoutAndPosition',        label: 'lockLayoutAndPosition（锁定布局与位置）' },
  { value: 'pogget.action.lockLayoutOnly',               label: 'lockLayoutOnly（只锁定布局）' },
  { value: 'pogget.action.lockPositionOnly',             label: 'lockPositionOnly（只锁定位置）' },
  { value: 'pogget.action.lockLayoutMenu',               label: 'lockLayoutMenu（锁定菜单）' },
  { value: 'pogget.action.personalizationMenu',          label: 'personalizationMenu（个性化菜单）' },
  { value: 'pogget.action.containerSettingsMenu',        label: 'containerSettingsMenu（设置菜单）' },

  { value: 'pogget.action.pasteBoardCapacityTitle',      label: 'pasteBoardCapacityTitle（剪贴容量）' },
  { value: 'pogget.action.pasteBoardCategoryText',       label: 'pasteBoardCategoryText（捕获文本）' },
  { value: 'pogget.action.pasteBoardCategoryImage',      label: 'pasteBoardCategoryImage（捕获图片）' },
  { value: 'pogget.action.pasteBoardCategoryOtherFiles', label: 'pasteBoardCategoryOtherFiles（捕获其他文件）' },
  { value: 'pogget.action.pasteBoardFileCategories',     label: 'pasteBoardFileCategories（剪贴文件类别）' },
  { value: 'pogget.action.pasteBoardClearAction',        label: 'pasteBoardClearAction（清空历史）' },
  { value: 'pogget.action.pasteBoardClearAndCloseAction',label: 'pasteBoardClearAndCloseAction（清空并关闭）' },
  { value: 'pogget.action.pasteBoardCloseOnlyAction',    label: 'pasteBoardCloseOnlyAction（仅关闭）' },
  { value: 'pogget.action.containerDeleteSubmenu',       label: 'containerDeleteSubmenu（删除子菜单）' },
  { value: 'pogget.action.containerDeleteMenu',          label: 'containerDeleteMenu（删除收纳盒）' }
];

const ACTION_LABELS = {};
ACTIONS.forEach(a => { if (a.value) ACTION_LABELS[a.value] = a.label; });

const COMPONENTS = [
  { type: 'rect',   name: '矩形',   glyph: '▭' },
  { type: 'solid',  name: '实色块', glyph: '■' },
  { type: 'glass',  name: '玻璃',   glyph: '◈' },
  { type: 'text',   name: '文字',   glyph: 'T' },
  { type: 'icon',   name: '图标',   glyph: '★' },
  { type: 'image',  name: '图片',   glyph: '▣' },
  { type: 'button', name: '按钮',   glyph: '⬒' },
  { type: 'group',  name: '分组',   glyph: '⬚' }
];

const ACCENT_HEX = '#5279FB';

/* =========================================================
   工具函数
   ========================================================= */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, d = 2) => Number(Number(v).toFixed(d));

function hexToRgb(hex) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toRgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a == null ? 1 : a})`;
}
function toRgbStr(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}
function escapeStr(s) {
  return String(s == null ? '' : s).replace(/"/g, '\\"');
}
function msToVina(ms) {
  return `${Math.max(0, Math.round(ms))}ms`;
}

/* =========================================================
   状态
   ========================================================= */
const state = {
  elements: [],
  selectedId: null,
  boardW: 360,
  boardH: 480,
  running: false,
  toggles: {}
};

const nodes = new Map();
let idCounter = 0;
const typeCounters = {};

function nextId() { return 'el' + (++idCounter); }
function nextSeq(type) {
  typeCounters[type] = (typeCounters[type] || 0) + 1;
  return typeCounters[type];
}

/* =========================================================
   DOM
   ========================================================= */
const canvasWrap = document.getElementById('canvasWrap');
const board      = document.getElementById('board');
const boardEmpty = document.getElementById('boardEmpty');
const compList   = document.getElementById('compList');
const inspBody   = document.getElementById('inspBody');
const modalMask  = document.getElementById('modalMask');
const codeOut    = document.getElementById('codeOut');
const runBtn     = document.getElementById('runBtn');
const runText    = document.getElementById('runText');

/* =========================================================
   持久化
   ========================================================= */
let saveTimer = null;

function saveState() {
  try {
    const data = {
      elements: state.elements,
      boardW: state.boardW,
      boardH: state.boardH
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 250);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data.elements)) {
      const clean = data.elements.filter(el =>
        el && typeof el === 'object' &&
        typeof el.id === 'string' &&
        typeof el.type === 'string' &&
        TYPE_NAMES[el.type]
      );

      clean.forEach(el => {
        const p = el.props || (el.props = {});

        if (p.glassRenderer === 'liquid') p.glassRenderer = 'lightEffect';
        if (el.type === 'glass' && p.glassActive == null) p.glassActive = true;
        if (el.type === 'glass' && p.glassBorder == null) p.glassBorder = 1;

        if (el.type === 'button') {
          if (p.transition == null) p.transition = 200;
          if (p.hoverOpacity == null) p.hoverOpacity = 1;
          if (p.holdDelay == null) p.holdDelay = 0.4;
          if (p.textLiteral == null) p.textLiteral = true;
          if (p.hitPaddingX == null) p.hitPaddingX = 0;
          if (p.hitPaddingY == null) p.hitPaddingY = 0;
        }

        if (p.visible == null) p.visible = true;
        if (p.enabled == null) p.enabled = true;
        if (p.opacity == null) p.opacity = 1;

        if (el.type === 'rect' && p.texture == null) p.texture = false;
      });

      state.elements = clean;

      let maxId = 0;
      const maxSeqs = {};
      clean.forEach(el => {
        const n = parseInt(String(el.id).replace(/^el/, ''), 10);
        if (!isNaN(n) && n > maxId) maxId = n;
        if (typeof el.seq === 'number') {
          maxSeqs[el.type] = Math.max(maxSeqs[el.type] || 0, el.seq);
        }
      });
      idCounter = maxId;
      Object.keys(maxSeqs).forEach(k => { typeCounters[k] = maxSeqs[k]; });
    }

    if (typeof data.boardW === 'number') state.boardW = clamp(data.boardW, 120, 1200);
    if (typeof data.boardH === 'number') state.boardH = clamp(data.boardH, 120, 1200);
  } catch (e) {}
}

/* =========================================================
   崩溃兜底
   ========================================================= */
let __crashed = false;

function showCrash() {
  if (__crashed) return;
  __crashed = true;
  try { saveState(); } catch (e) {}
  try {
    document.body.classList.add('is-crashed');
    document.title = '页面崩溃 · CustomVinaEditor';
    const mask = document.createElement('div');
    mask.className = 'crash-mask';
    mask.innerHTML =
      '<h1 class="crash-title">页面崩溃</h1>' +
      '<p class="crash-desc">已经尝试保存您的编辑内容，请刷新页面</p>';
    document.body.appendChild(mask);
  } catch (e) {}
}

const __originalConsoleError = console.error.bind(console);
console.error = function (...args) {
  try { __originalConsoleError(...args); } catch (e) {}
  showCrash();
};

window.addEventListener('error', () => { if (!__crashed) showCrash(); });
window.addEventListener('unhandledrejection', () => { if (!__crashed) showCrash(); });

/* =========================================================
   元素工厂
   ========================================================= */
function makeElement(type, x, y) {
  const el = {
    id: nextId(),
    type,
    seq: nextSeq(type),
    x: Math.round(x),
    y: Math.round(y),
    w: 120,
    h: 80,
    props: {}
  };
  const p = el.props;

  switch (type) {
    case 'rect':
      el.w = 160; el.h = 48;
      Object.assign(p, {
        z: 0, radius: 12,
        background: ACCENT_HEX, fillOpacity: 1,
        border: 0, borderColor: '#ffffff', borderOpacity: 1, borderStyle: 'solid',
        texture: false,
        opacity: 1, visible: true, enabled: true
      });
      break;
    case 'solid':
      el.w = 140; el.h = 60;
      Object.assign(p, {
        z: 0, background: '#111111', fillOpacity: 1,
        opacity: 1, visible: true, enabled: true
      });
      break;
    case 'glass':
      el.w = 180; el.h = 72;
      Object.assign(p, {
        z: 1, radius: 16,
        background: '#202837', fillOpacity: 0.28,
        glassRenderer: 'standard', glassActive: true,
        glassOpacity: 0.8, glassBorder: 1,
        opacity: 1, visible: true, enabled: true
      });
      break;
    case 'text':
      el.w = 160; el.h = 20;
      Object.assign(p, {
        z: 1, label: '我的第一张卡片',
        textLiteral: true, textSize: 14,
        color: '#ffffff', font: 'Segoe UI',
        align: 'left', textX: 0, textY: 0,
        opacity: 1, visible: true, enabled: true
      });
      break;
    case 'icon':
      el.w = 32; el.h = 32;
      Object.assign(p, {
        z: 1, icon: '★', textSize: 16,
        color: '#111111', font: 'Font Awesome 6 Free Solid',
        opacity: 1, visible: true, enabled: true
      });
      break;
    case 'image':
      el.w = 96; el.h = 96;
      Object.assign(p, {
        z: 0, radius: 12,
        source: '', imageRenderer: 'wic', imageFit: 'contain',
        opacity: 1, visible: true, enabled: true
      });
      break;
    case 'button':
      el.w = 100; el.h = 28;
      Object.assign(p, {
        z: 10, radius: 6,
        background: ACCENT_HEX, fillOpacity: 1,
        border: 0, borderColor: '#ffffff', borderOpacity: 1, borderStyle: 'solid',
        label: '切换视图', icon: '', textLiteral: true,
        textSize: 12, color: '#ffffff', font: 'Segoe UI',
        action: 'pogget.action.view.toggle',
        holdAction: '', holdDelay: 0.4,
        hitPaddingX: 0, hitPaddingY: 0,
        transition: 200, hoverOpacity: 0.75,
        opacity: 1, visible: true, enabled: true
      });
      break;
    case 'group':
      el.w = 160; el.h = 100;
      Object.assign(p, {
        z: 0, clip: false, clipRadius: 0, clipLayer: false,
        opacity: 1, visible: true, enabled: true
      });
      break;
  }
  return el;
}

function compName(el) {
  return (TYPE_NAMES[el.type] || 'Node') + (el.seq || '');
}
function getElement(id) {
  return state.elements.find(e => e.id === id) || null;
}
function getSelected() {
  return getElement(state.selectedId);
}

/* =========================================================
   渲染
   ========================================================= */
function ensureNode(el) {
  let node = nodes.get(el.id);
  if (node) return node;

  node = document.createElement('div');
  node.className = 'el';
  node.dataset.id = el.id;

  const body = document.createElement('div');
  body.className = 'el-body';
  node.appendChild(body);

  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  node.appendChild(handle);

  node._body = body;
  board.appendChild(node);
  nodes.set(el.id, node);
  return node;
}

function styleBody(body, el) {
  const p = el.props;

  body.className = 'el-body';
  body.removeAttribute('style');
  body.textContent = '';
  body.onpointerenter = null;
  body.onpointerleave = null;

  if (p.radius != null) body.style.borderRadius = p.radius + 'px';
  if (p.opacity != null && p.opacity < 1) body.style.opacity = p.opacity;
  if (p.visible === false) body.style.opacity = Math.min(body.style.opacity || 1, 0.15);

  const borderStyle = p.borderStyle === 'dash' ? 'dashed' : 'solid';

  if (p.shadowOpacity > 0) {
    body.style.boxShadow = `${p.shadowX || 0}px ${p.shadowY == null ? 4 : p.shadowY}px ${p.shadowBlur == null ? 16 : p.shadowBlur}px ${toRgba(p.shadowColor || '#000000', p.shadowOpacity)}`;
  }

  switch (el.type) {
    case 'rect': {
      body.style.background = toRgba(p.background, p.fillOpacity);
      if (p.border) {
        body.style.border = `${p.border}px ${borderStyle} ${toRgba(p.borderColor, p.borderOpacity)}`;
      }
      if (p.texture) {
        const tw = p.texture === true ? 1 : Math.max(1, Number(p.texture) || 1);
        body.style.backgroundImage =
          `repeating-linear-gradient(45deg, ${toRgba(p.borderColor || ACCENT_HEX, 0.18)} 0 ${tw}px, transparent ${tw}px ${tw + 6}px)`;
      }
      break;
    }
    case 'solid':
      body.style.background = toRgba(p.background, p.fillOpacity);
      break;
    case 'button': {
      body.classList.add('is-button');
      body.style.background = toRgba(p.background, p.fillOpacity);
      if (p.border) {
        body.style.border = `${p.border}px ${borderStyle} ${toRgba(p.borderColor, p.borderOpacity)}`;
      }
      body.style.color = p.color;
      body.style.fontSize = p.textSize + 'px';
      body.style.fontFamily = p.font || 'Segoe UI';
      body.style.display = 'flex';
      body.style.alignItems = 'center';
      body.style.justifyContent = 'center';
      body.textContent = p.icon || p.label || '按钮';

      if (!state.running && p.hoverOpacity != null && p.hoverOpacity < 1) {
        const ms = p.transition != null ? p.transition : 200;
        body.style.transition = `opacity ${ms}ms ease`;
        body.onpointerenter = () => { body.style.opacity = p.hoverOpacity; };
        body.onpointerleave = () => { body.style.opacity = p.opacity != null ? p.opacity : ''; };
      }
      break;
    }
    case 'glass': {
      const isLight = p.glassRenderer === 'lightEffect';
      body.style.background =
        `repeating-linear-gradient(45deg, ${toRgba(p.borderColor || ACCENT_HEX, 0.14)} 0 1px, transparent 1px 7px), ` +
        toRgba(p.background, Math.min(0.16, p.fillOpacity || 0.28));
      const active = isLight ? true : p.glassActive !== false;
      if (active && (p.glassBorder || 0) > 0) {
        body.style.border = `${p.glassBorder}px solid ${toRgba(p.borderColor || ACCENT_HEX, 0.42)}`;
      }
      body.style.backdropFilter = 'blur(2px)';
      body.style.webkitBackdropFilter = 'blur(2px)';
      break;
    }
    case 'text':
      body.style.display = 'flex';
      body.style.alignItems = 'center';
      body.style.justifyContent =
        p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center';
      body.style.color = p.color;
      body.style.fontSize = p.textSize + 'px';
      body.style.fontFamily = p.font || 'Segoe UI';
      body.style.lineHeight = '1.2';
      body.style.paddingLeft = (p.textX || 0) + 'px';
      body.style.paddingTop  = (p.textY || 0) + 'px';
      body.textContent = p.label;
      if (p.textShadowOpacity > 0) {
        body.style.textShadow =
          `${p.textShadowX || 0}px ${p.textShadowY == null ? 1 : p.textShadowY}px ${p.textShadowBlur == null ? 2 : p.textShadowBlur}px ${toRgba(p.textShadowColor || '#000000', p.textShadowOpacity)}`;
      }
      break;
    case 'icon':
      body.style.display = 'flex';
      body.style.alignItems = 'center';
      body.style.justifyContent = 'center';
      body.style.color = p.color;
      body.style.fontSize = p.textSize + 'px';
      body.textContent = p.icon || '★';
      break;
    case 'image':
      body.style.display = 'flex';
      body.style.alignItems = 'center';
      body.style.justifyContent = 'center';
      body.style.background = '#fafafa';
      body.style.border = '1px dashed #b8b8b8';
      body.style.color = '#b0b0b0';
      body.style.fontSize = '20px';
      body.textContent = '▣';
      break;
    case 'group':
      body.style.background = 'transparent';
      body.style.border = '1px dashed #9a9a9a';
      if (p.clip) body.style.overflow = 'hidden';
      break;
  }
}

function renderElement(el) {
  const node = ensureNode(el);
  node.style.left   = el.x + 'px';
  node.style.top    = el.y + 'px';
  node.style.width  = el.w + 'px';
  node.style.height = el.h + 'px';
  node.style.zIndex = el.props.z != null ? el.props.z : 0;
  node.classList.toggle('selected', !state.running && state.selectedId === el.id);
  node.dataset.action = el.props.action || '';
  styleBody(node._body, el);
  scheduleSave();
}

function updateEmptyHint() {
  boardEmpty.style.display = state.elements.length ? 'none' : 'flex';
}
function removeElement(id) {
  const node = nodes.get(id);
  if (node) node.remove();
  nodes.delete(id);
  state.elements = state.elements.filter(e => e.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  updateEmptyHint();
  renderInspector();
  saveState();
}
function select(id) {
  if (state.running) return;
  state.selectedId = id;
  state.elements.forEach(renderElement);
  renderInspector();
}

/* =========================================================
   画板尺寸
   ========================================================= */
function applyBoardSize() {
  board.style.width  = state.boardW + 'px';
  board.style.height = state.boardH + 'px';
  state.elements.forEach(el => {
    el.x = clamp(el.x, -el.w + 16, state.boardW - 16);
    el.y = clamp(el.y, -el.h + 16, state.boardH - 16);
    renderElement(el);
  });
  scheduleSave();
}

/* =========================================================
   属性面板控件
   ========================================================= */
function addSection(parent, title) {
  const h = document.createElement('div');
  h.className = 'insp-section';
  h.textContent = title;
  parent.appendChild(h);
}
function addField(parent, label, control) {
  const row = document.createElement('div');
  row.className = 'field';
  const lb = document.createElement('label');
  lb.textContent = label;
  lb.title = label;
  row.appendChild(lb);
  row.appendChild(control);
  parent.appendChild(row);
}

function numInput(value, onChange, opts) {
  opts = opts || {};
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'ctl';
  inp.value = value;
  inp.dataset.key = opts.key || '';
  if (opts.min != null) inp.min = opts.min;
  if (opts.max != null) inp.max = opts.max;
  inp.step = opts.step != null ? opts.step : 1;
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    if (!isNaN(v)) onChange(v);
  });
  return inp;
}
function rangeInput(value, onChange, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'range-wrap';

  const inp = document.createElement('input');
  inp.type = 'range';
  inp.className = 'range';
  inp.min = opts.min;
  inp.max = opts.max;
  inp.step = opts.step;
  inp.value = value;

  const out = document.createElement('span');
  out.className = 'range-val';
  const digits = String(opts.step).includes('.') ? String(opts.step).split('.')[1].length : 0;
  out.textContent = Number(value).toFixed(digits);

  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    out.textContent = v.toFixed(digits);
    onChange(v);
  });

  wrap.appendChild(inp);
  wrap.appendChild(out);
  return wrap;
}
function colorInput(value, onChange) {
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.className = 'ctl ctl-color';
  inp.value = value || '#000000';
  inp.addEventListener('input', () => onChange(inp.value));
  return inp;
}
function textInput(value, onChange) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'ctl';
  inp.value = value == null ? '' : value;
  inp.addEventListener('input', () => onChange(inp.value));
  return inp;
}
function selectInput(value, options, onChange) {
  const sel = document.createElement('select');
  sel.className = 'ctl';
  options.forEach(o => {
    const op = document.createElement('option');
    op.value = o.value;
    op.textContent = o.label;
    if (String(o.value) === String(value)) op.selected = true;
    sel.appendChild(op);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

/* =========================================================
   属性面板
   ========================================================= */
function renderInspector() {
  if (state.running) {
    inspBody.innerHTML =
      `<div class="insp-empty">
         <p>正在运行</p>
         <span>点击右上角“停止”返回编辑模式</span>
       </div>`;
    return;
  }

  const el = getSelected();
  inspBody.innerHTML = '';

  if (!el) {
    inspBody.innerHTML =
      `<div class="insp-empty">
         <div class="insp-empty-icon">⬚</div>
         <p>未选择组件</p>
         <span>从左侧拖拽组件到画布<br>点击画布中的组件即可编辑</span>
       </div>`;
    return;
  }

  const p = el.props;

  const head = document.createElement('div');
  head.className = 'insp-el-head';
  head.innerHTML =
    `<span class="insp-el-name">${compName(el)}</span>
     <span class="insp-el-type">${el.type}</span>`;
  inspBody.appendChild(head);

  addSection(inspBody, '布局');
  addField(inspBody, 'X', numInput(el.x, v => { el.x = Math.round(v); renderElement(el); }, { key: 'x' }));
  addField(inspBody, 'Y', numInput(el.y, v => { el.y = Math.round(v); renderElement(el); }, { key: 'y' }));
  addField(inspBody, '宽度 width', numInput(el.w, v => { el.w = Math.max(4, Math.round(v)); renderElement(el); }, { key: 'w', min: 4 }));
  addField(inspBody, '高度 height', numInput(el.h, v => { el.h = Math.max(4, Math.round(v)); renderElement(el); }, { key: 'h', min: 4 }));
  addField(inspBody, '层级 z', numInput(p.z != null ? p.z : 0, v => { p.z = Math.round(v); renderElement(el); }, { step: 1 }));
  addField(inspBody, '不透明度 opacity', rangeInput(p.opacity != null ? p.opacity : 1, v => { p.opacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
  addField(inspBody, '可见 visible', selectInput(String(p.visible !== false), [
    { value: 'true', label: 'true' },
    { value: 'false', label: 'false' }
  ], v => { p.visible = v === 'true'; renderElement(el); }));
  addField(inspBody, '启用 enabled', selectInput(String(p.enabled !== false), [
    { value: 'true', label: 'true' },
    { value: 'false', label: 'false' }
  ], v => { p.enabled = v === 'true'; renderElement(el); }));

  addSection(inspBody, '外观');
  if (p.radius != null) {
    addField(inspBody, '圆角 radius', rangeInput(p.radius, v => { p.radius = v; renderElement(el); }, { min: 0, max: 48, step: 1 }));
  }
  if (p.background != null) {
    addField(inspBody, '背景色', colorInput(p.background, v => { p.background = v; renderElement(el); }));
    addField(inspBody, '填充不透明度', rangeInput(p.fillOpacity != null ? p.fillOpacity : 1, v => { p.fillOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
  }
  if (p.border != null) {
    addField(inspBody, '边框 border', rangeInput(p.border, v => { p.border = v; renderElement(el); }, { min: 0, max: 16, step: 1 }));
    addField(inspBody, '边框色', colorInput(p.borderColor, v => { p.borderColor = v; renderElement(el); }));
    addField(inspBody, '边框不透明度', rangeInput(p.borderOpacity != null ? p.borderOpacity : 1, v => { p.borderOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
    addField(inspBody, '边框样式', selectInput(p.borderStyle || 'solid', [
      { value: 'solid', label: 'solid（实线）' },
      { value: 'dash',  label: 'dash（虚线）' }
    ], v => { p.borderStyle = v; renderElement(el); }));
  }
  addField(inspBody, '阴影不透明度', rangeInput(p.shadowOpacity != null ? p.shadowOpacity : 0, v => { p.shadowOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
  if (p.shadowOpacity > 0) {
    addField(inspBody, '阴影色', colorInput(p.shadowColor || '#000000', v => { p.shadowColor = v; renderElement(el); }));
    addField(inspBody, '阴影 X', numInput(p.shadowX || 0, v => { p.shadowX = Math.round(v); renderElement(el); }, { step: 1 }));
    addField(inspBody, '阴影 Y', numInput(p.shadowY == null ? 4 : p.shadowY, v => { p.shadowY = Math.round(v); renderElement(el); }, { step: 1 }));
    addField(inspBody, '阴影模糊', numInput(p.shadowBlur == null ? 16 : p.shadowBlur, v => { p.shadowBlur = Math.max(0, Math.round(v)); renderElement(el); }, { min: 0, step: 1 }));
  }

  if (el.type === 'rect') {
    const texValue = p.texture === true ? 'true' : p.texture ? String(p.texture) : 'false';
    const texOpts = [
      { value: 'false', label: '无' },
      { value: 'true',  label: 'true（立体纹理）' }
    ];
    if (texValue !== 'false' && texValue !== 'true') {
      texOpts.push({ value: texValue, label: `${texValue}（自定义宽度）` });
    }
    addField(inspBody, '纹理 texture', selectInput(texValue, texOpts, v => {
      if (v === 'false') p.texture = false;
      else if (v === 'true') p.texture = true;
      else p.texture = Number(v) || 1;
      renderElement(el);
    }));
    if (p.texture && p.texture !== true) {
      addField(inspBody, '纹理宽度', rangeInput(Math.max(1, Number(p.texture)), v => {
        p.texture = Math.max(1, Math.round(v));
        renderElement(el);
      }, { min: 1, max: 32, step: 1 }));
    }
  }

  if (el.type === 'text') {
    addSection(inspBody, '文字');
    addField(inspBody, '内容 label', textInput(p.label, v => { p.label = v; renderElement(el); }));
    addField(inspBody, 'textLiteral', selectInput(String(p.textLiteral !== false), [
      { value: 'true', label: 'true（按原文显示）' },
      { value: 'false', label: 'false' }
    ], v => { p.textLiteral = v === 'true'; }));
    addField(inspBody, '字号 textSize', rangeInput(p.textSize, v => { p.textSize = v; renderElement(el); }, { min: 8, max: 64, step: 1 }));
    addField(inspBody, '颜色 color', colorInput(p.color, v => { p.color = v; renderElement(el); }));
    addField(inspBody, '对齐 align', selectInput(p.align, [
      { value: 'left', label: 'left' },
      { value: 'center', label: 'center' },
      { value: 'right', label: 'right' }
    ], v => { p.align = v; renderElement(el); }));
    addField(inspBody, '字体 font', textInput(p.font, v => { p.font = v; renderElement(el); }));
    addField(inspBody, 'textX', numInput(p.textX || 0, v => { p.textX = Math.round(v); renderElement(el); }, { step: 1 }));
    addField(inspBody, 'textY', numInput(p.textY || 0, v => { p.textY = Math.round(v); renderElement(el); }, { step: 1 }));

    addSection(inspBody, '文字阴影');
    addField(inspBody, '阴影不透明度', rangeInput(p.textShadowOpacity != null ? p.textShadowOpacity : 0, v => { p.textShadowOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
    if (p.textShadowOpacity > 0) {
      addField(inspBody, '阴影色', colorInput(p.textShadowColor || '#000000', v => { p.textShadowColor = v; renderElement(el); }));
      addField(inspBody, '阴影 X', numInput(p.textShadowX || 0, v => { p.textShadowX = Math.round(v); renderElement(el); }, { step: 1 }));
      addField(inspBody, '阴影 Y', numInput(p.textShadowY == null ? 1 : p.textShadowY, v => { p.textShadowY = Math.round(v); renderElement(el); }, { step: 1 }));
      addField(inspBody, '阴影模糊', numInput(p.textShadowBlur == null ? 2 : p.textShadowBlur, v => { p.textShadowBlur = Math.max(0, Math.round(v)); renderElement(el); }, { min: 0, step: 1 }));
    }
  }

  if (el.type === 'icon') {
    addSection(inspBody, '图标');
    addField(inspBody, '图标字符 icon', textInput(p.icon, v => { p.icon = v; renderElement(el); }));
    addField(inspBody, '字体 font', textInput(p.font, v => { p.font = v; renderElement(el); }));
    addField(inspBody, '字号', rangeInput(p.textSize, v => { p.textSize = v; renderElement(el); }, { min: 8, max: 64, step: 1 }));
    addField(inspBody, '颜色', colorInput(p.color, v => { p.color = v; renderElement(el); }));
  }

  if (el.type === 'image') {
    addSection(inspBody, '图片');
    addField(inspBody, 'source', textInput(p.source, v => { p.source = v; renderElement(el); }));
    addField(inspBody, 'imageRenderer', selectInput(p.imageRenderer || 'wic', [
      { value: 'wic',      label: 'wic' },
      { value: 'shell',    label: 'shell' },
      { value: 'resource', label: 'resource' }
    ], v => { p.imageRenderer = v; renderElement(el); }));
    addField(inspBody, 'imageFit', selectInput(p.imageFit || 'contain', [
      { value: 'stretch', label: 'stretch' },
      { value: 'contain', label: 'contain' }
    ], v => { p.imageFit = v; renderElement(el); }));
  }

  if (el.type === 'glass') {
    addSection(inspBody, '玻璃');
    addField(inspBody, 'glassRenderer', selectInput(p.glassRenderer || 'standard', [
      { value: 'standard',    label: 'standard（普通高光）' },
      { value: 'lightEffect', label: 'lightEffect（光效）' }
    ], v => { p.glassRenderer = v; renderElement(el); }));

    if (p.glassRenderer === 'standard') {
      addField(inspBody, 'glassActive', selectInput(String(p.glassActive !== false), [
        { value: 'true',  label: 'true（启用高光）' },
        { value: 'false', label: 'false（关闭高光）' }
      ], v => { p.glassActive = v === 'true'; renderElement(el); }));
    }
    addField(inspBody, 'glassBorder', rangeInput(p.glassBorder != null ? p.glassBorder : 1, v => { p.glassBorder = v; renderElement(el); }, { min: 0, max: 8, step: 1 }));
    addField(inspBody, 'glassOpacity', rangeInput(p.glassOpacity != null ? p.glassOpacity : 0.8, v => { p.glassOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
  }

  if (el.type === 'button') {
    addSection(inspBody, '按钮内容');
    addField(inspBody, '标签 label', textInput(p.label, v => { p.label = v; renderElement(el); }));
    addField(inspBody, 'textLiteral', selectInput(String(p.textLiteral !== false), [
      { value: 'true', label: 'true（按原文显示）' },
      { value: 'false', label: 'false' }
    ], v => { p.textLiteral = v === 'true'; }));
    addField(inspBody, '图标 icon（优先）', textInput(p.icon, v => { p.icon = v; renderElement(el); }));
    addField(inspBody, '字号', rangeInput(p.textSize, v => { p.textSize = v; renderElement(el); }, { min: 8, max: 32, step: 1 }));
    addField(inspBody, '文字颜色', colorInput(p.color, v => { p.color = v; renderElement(el); }));
    addField(inspBody, '字体', textInput(p.font, v => { p.font = v; renderElement(el); }));

    addSection(inspBody, '按钮行为');
    addField(inspBody, 'interaction', selectInput(p.interaction || '', [
      { value: '',      label: '（无）' },
      { value: 'title', label: 'title（跟随标题）' },
      { value: 'icon',  label: 'icon（跟随文件图标）' }
    ], v => { p.interaction = v || undefined; }));

    addField(inspBody, 'action', selectInput(p.action || '', ACTIONS, v => {
      p.action = v || undefined;
      renderElement(el);
    }));

    addField(inspBody, 'holdAction', selectInput(p.holdAction || '', ACTIONS, v => {
      p.holdAction = v || undefined;
    }));

    addField(inspBody, 'holdDelay (ms)', numInput(p.holdDelay != null ? Math.round(p.holdDelay * 1000) : 400, v => {
      p.holdDelay = Math.max(0, v / 1000);
    }, { min: 0, step: 50 }));

    addField(inspBody, 'hitPaddingX', numInput(p.hitPaddingX || 0, v => { p.hitPaddingX = Math.max(0, Math.round(v)); }, { min: 0 }));
    addField(inspBody, 'hitPaddingY', numInput(p.hitPaddingY || 0, v => { p.hitPaddingY = Math.max(0, Math.round(v)); }, { min: 0 }));

    addField(inspBody, 'transition (ms)', numInput(p.transition != null ? p.transition : 200, v => {
      p.transition = Math.max(0, Math.round(v));
    }, { min: 0, step: 10 }));

    addField(inspBody, '悬停 opacity', rangeInput(p.hoverOpacity != null ? p.hoverOpacity : 1, v => {
      p.hoverOpacity = v; renderElement(el);
    }, { min: 0, max: 1, step: 0.01 }));
  }

  if (el.type === 'group') {
    addSection(inspBody, '分组');
    addField(inspBody, 'clip', selectInput(String(p.clip === true), [
      { value: 'false', label: 'false' },
      { value: 'true',  label: 'true（裁剪子节点）' }
    ], v => { p.clip = v === 'true'; renderElement(el); }));
    if (p.clip) {
      addField(inspBody, 'clipRadius', numInput(p.clipRadius || 0, v => {
        p.clipRadius = Math.max(0, Math.round(v)); renderElement(el);
      }, { min: 0 }));
      addField(inspBody, 'clipLayer', selectInput(String(p.clipLayer === true), [
        { value: 'false', label: 'false' },
        { value: 'true',  label: 'true（共享蒙版）' }
      ], v => { p.clipLayer = v === 'true'; }));
    }
  }

  const del = document.createElement('button');
  del.className = 'btn-danger';
  del.textContent = '删除组件';
  del.addEventListener('click', () => removeElement(el.id));
  inspBody.appendChild(del);
}

/* =========================================================
   导出
   ========================================================= */
function genCode() {
  const lines = [];
  lines.push('Preset { dependsOn: "Pogget_Std" }');
  lines.push('');

  if (state.elements.length === 0) {
    lines.push('// 画布为空，从左侧拖入组件后再导出');
  }

  state.elements.forEach(el => {
    const p = el.props;
    const attrs = [];

    attrs.push(['type', `"${el.type}"`]);
    attrs.push(['x', el.x]);
    attrs.push(['y', el.y]);
    attrs.push(['width', el.w]);
    attrs.push(['height', el.h]);

    if (p.z != null && p.z !== 0) attrs.push(['z', p.z]);
    if (p.opacity != null && p.opacity !== 1) attrs.push(['opacity', round(p.opacity, 2)]);
    if (p.visible === false) attrs.push(['visible', false]);
    if (p.enabled === false) attrs.push(['enabled', false]);
    if (p.interaction) attrs.push(['interaction', `"${p.interaction}"`]);

    if (p.radius != null && p.radius !== 0) attrs.push(['radius', p.radius]);
    if (p.background != null) attrs.push(['background', toRgbStr(p.background)]);
    if (p.fillOpacity != null && p.fillOpacity !== 1) attrs.push(['fillOpacity', round(p.fillOpacity, 2)]);

    if (p.border != null && p.border !== 0) {
      attrs.push(['border', p.border]);
      if (p.borderColor) attrs.push(['borderColor', toRgbStr(p.borderColor)]);
      if (p.borderOpacity != null && p.borderOpacity !== 1) attrs.push(['borderOpacity', round(p.borderOpacity, 2)]);
      if (p.borderStyle && p.borderStyle !== 'solid') attrs.push(['borderStyle', `"${p.borderStyle}"`]);
    }

    if (p.shadowOpacity > 0) {
      attrs.push(['shadowOpacity', round(p.shadowOpacity, 2)]);
      if (p.shadowColor) attrs.push(['shadowColor', toRgbStr(p.shadowColor)]);
      if (p.shadowX) attrs.push(['shadowX', p.shadowX]);
      if (p.shadowY != null && p.shadowY !== 4) attrs.push(['shadowY', p.shadowY]);
      if (p.shadowBlur != null && p.shadowBlur !== 16) attrs.push(['shadowBlur', p.shadowBlur]);
    }

    if (el.type === 'rect' && p.texture) {
      if (p.texture === true) attrs.push(['texture', true]);
      else attrs.push(['texture', Math.max(0, Math.round(p.texture))]);
    }

    if (el.type === 'glass') {
      if (p.glassRenderer) attrs.push(['glassRenderer', `"${p.glassRenderer}"`]);
      if (p.glassRenderer === 'standard' && p.glassActive != null) {
        attrs.push(['glassActive', p.glassActive]);
      }
      if (p.glassBorder != null) attrs.push(['glassBorder', p.glassBorder]);
      if (p.glassOpacity != null) attrs.push(['glassOpacity', round(p.glassOpacity, 2)]);
    }

    if (el.type === 'text') {
      attrs.push(['label', `"${escapeStr(p.label)}"`]);
      attrs.push(['textLiteral', p.textLiteral !== false]);
      attrs.push(['textSize', p.textSize]);
      attrs.push(['color', toRgbStr(p.color)]);
      if (p.font) attrs.push(['font', `"${p.font}"`]);
      if (p.align) attrs.push(['align', `"${p.align}"`]);
      if (p.textX) attrs.push(['textX', p.textX]);
      if (p.textY) attrs.push(['textY', p.textY]);

      if (p.textShadowOpacity > 0) {
        attrs.push(['textShadowOpacity', round(p.textShadowOpacity, 2)]);
        if (p.textShadowColor) attrs.push(['textShadowColor', toRgbStr(p.textShadowColor)]);
        if (p.textShadowX) attrs.push(['textShadowX', p.textShadowX]);
        if (p.textShadowY != null && p.textShadowY !== 1) attrs.push(['textShadowY', p.textShadowY]);
        if (p.textShadowBlur != null && p.textShadowBlur !== 2) attrs.push(['textShadowBlur', p.textShadowBlur]);
      }
    }

    if (el.type === 'icon') {
      attrs.push(['icon', `"${escapeStr(p.icon)}"`]);
      attrs.push(['textSize', p.textSize]);
      attrs.push(['color', toRgbStr(p.color)]);
      if (p.font) attrs.push(['font', `"${p.font}"`]);
    }

    if (el.type === 'button') {
      if (p.label) {
        attrs.push(['label', `"${escapeStr(p.label)}"`]);
        attrs.push(['textLiteral', p.textLiteral !== false]);
      }
      if (p.icon) attrs.push(['icon', `"${escapeStr(p.icon)}"`]);
      if (p.textSize) attrs.push(['textSize', p.textSize]);
      if (p.color) attrs.push(['color', toRgbStr(p.color)]);
      if (p.font) attrs.push(['font', `"${p.font}"`]);
      if (p.transition) attrs.push(['transition', msToVina(p.transition)]);
      if (p.hitPaddingX) attrs.push(['hitPaddingX', p.hitPaddingX]);
      if (p.hitPaddingY) attrs.push(['hitPaddingY', p.hitPaddingY]);
      if (p.holdDelay) attrs.push(['holdDelay', msToVina(p.holdDelay * 1000)]);
    }

    if (el.type === 'image') {
      if (p.source) attrs.push(['source', `"${escapeStr(p.source)}"`]);
      if (p.imageRenderer && p.imageRenderer !== 'wic') attrs.push(['imageRenderer', `"${p.imageRenderer}"`]);
      if (p.imageFit && p.imageFit !== 'stretch') attrs.push(['imageFit', `"${p.imageFit}"`]);
    }

    if (el.type === 'group') {
      if (p.clip) {
        attrs.push(['clip', true]);
        if (p.clipRadius) attrs.push(['clipRadius', p.clipRadius]);
        if (p.clipLayer) attrs.push(['clipLayer', true]);
      }
    }

    if (p.action) attrs.push(['action', p.action]);
    if (p.holdAction) attrs.push(['holdAction', p.holdAction]);

    const hasHover = el.type === 'button'
      && p.hoverOpacity != null
      && p.hoverOpacity < 1;

    lines.push(compName(el) + ' {');
    lines.push('  view {');

    attrs.forEach((pair, i) => {
      const comma = (i < attrs.length - 1 || hasHover) ? ',' : '';
      lines.push(`    ${pair[0]}: ${pair[1]}${comma}`);
    });

    if (hasHover) {
      lines.push('    hover {');
      lines.push(`      opacity: ${round(p.hoverOpacity, 2)}`);
      lines.push('    }');
    }

    lines.push('  }');
    lines.push('}');
    lines.push('');
  });

  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

function openExport() {
  codeOut.textContent = genCode();
  modalMask.classList.add('show');
}
function closeExport() {
  modalMask.classList.remove('show');
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 1800);
}

/* =========================================================
   运行模式
   ========================================================= */
function setRunning(on) {
  state.running = on;
  board.classList.toggle('running', on);
  runBtn.classList.toggle('is-running', on);
  runText.textContent = on ? '停止' : '运行';
  runBtn.title = on ? '停止运行，返回编辑' : '运行预设，与组件交互';

  if (on) {
    state.selectedId = null;
    ContextMenu.close();
    state.elements.forEach(renderElement);
    renderInspector();
    toast('已进入运行模式，点击带 action 的组件进行交互');
  } else {
    state.elements.forEach(renderElement);
    renderInspector();
    toast('已退出运行模式');
  }
}

function handleAction(action) {
  const label = ACTION_LABELS[action] || action;
  toast(`▶ 触发：${label}`);
}

runBtn.addEventListener('click', () => setRunning(!state.running));

board.addEventListener('click', e => {
  if (!state.running) return;
  const node = e.target.closest('.el');
  if (!node) return;
  const el = getElement(node.dataset.id);
  if (!el) return;
  const action = el.props.action;
  if (!action) return;
  e.stopPropagation();
  handleAction(action);
});

/* =========================================================
   事件绑定
   ========================================================= */
document.getElementById('exportBtn').addEventListener('click', openExport);
document.getElementById('modalClose').addEventListener('click', closeExport);
modalMask.addEventListener('click', e => { if (e.target === modalMask) closeExport(); });

document.getElementById('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeOut.textContent);
    toast('代码已复制到剪贴板');
  } catch {
    toast('复制失败，请手动选择代码');
  }
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  download('MyPreset.vina', codeOut.textContent);
  toast('已下载 MyPreset.vina');
});

const boardWInput = document.getElementById('boardWInput');
const boardHInput = document.getElementById('boardHInput');

boardWInput.addEventListener('change', () => {
  if (state.running) return;
  state.boardW = clamp(parseInt(boardWInput.value, 10) || 360, 120, 1200);
  boardWInput.value = state.boardW;
  applyBoardSize();
});
boardHInput.addEventListener('change', () => {
  if (state.running) return;
  state.boardH = clamp(parseInt(boardHInput.value, 10) || 480, 120, 1200);
  boardHInput.value = state.boardH;
  applyBoardSize();
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (modalMask.classList.contains('show')) closeExport();
    if (versionMask.classList.contains('show')) closeVersion();
  }
});

/* =========================================================
   版本信息
   ========================================================= */
const versionBadge = document.getElementById('versionBadge');
const versionMask  = document.getElementById('versionMask');
const versionOk    = document.getElementById('versionOk');

function openVersion() { versionMask.classList.add('show'); }
function closeVersion() { versionMask.classList.remove('show'); }

if (versionBadge) versionBadge.addEventListener('click', openVersion);
if (versionOk) versionOk.addEventListener('click', closeVersion);
if (versionMask) versionMask.addEventListener('click', e => {
  if (e.target === versionMask) closeVersion();
});

/* =========================================================
   调试：连续点击版权 5 次触发崩溃
   ========================================================= */
(function installCrashTrigger() {
  const el = document.getElementById('copyrightEl');
  if (!el) return;

  let clicks = 0, timer = null;

  el.addEventListener('click', () => {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 1200);

    if (clicks >= 5) {
      clicks = 0;
      console.error('[DEBUG] Manual crash triggered via copyright click');
    }
  });
})();

/* =========================================================
   输入保存
   ========================================================= */
inspBody.addEventListener('input', scheduleSave);
inspBody.addEventListener('change', scheduleSave);

/* =========================================================
   初始化
   ========================================================= */
(function setCopyrightYear() {
  const el = document.getElementById('copyYear');
  if (!el) return;
  el.textContent = Math.max(2026, new Date().getFullYear());
})();

function init() {
  loadState();

  boardWInput.value = state.boardW;
  boardHInput.value = state.boardH;

  applyBoardSize();

  /* 初始化 TouchDrag（拖拽 / 缩放 / 组件库） */
  TouchDrag.init({
    state: state,
    board: board,
    canvasWrap: canvasWrap,
    compList: compList,
    inspBody: inspBody,
    COMPONENTS: COMPONENTS,
    clamp: clamp,
    round: round,
    getElement: getElement,
    makeElement: makeElement,
    renderElement: renderElement,
    select: select,
    updateEmptyHint: updateEmptyHint,
    removeElement: removeElement,
    saveState: saveState
  });

  /* 初始化 ContextMenu（右键 / Ctrl+C / Ctrl+V） */
  ContextMenu.init({
    state: state,
    board: board,
    canvasWrap: canvasWrap,
    clamp: clamp,
    getElement: getElement,
    getSelected: getSelected,
    removeElement: removeElement,
    select: select,
    renderElement: renderElement,
    updateEmptyHint: updateEmptyHint,
    saveState: saveState,
    nextId: nextId,
    nextSeq: nextSeq,
    toast: toast,
    clientToBoard: function (x, y) { return TouchDrag.clientToBoard(x, y); }
  });

  updateEmptyHint();
  renderInspector();
}
init();

window.addEventListener('beforeunload', () => {
  try { saveState(); } catch (e) {}
});

/* =========================================================
   启动加载
   ========================================================= */
(function bootController() {
  const boot = document.getElementById('boot');
  const fill = document.getElementById('bootFill');
  const bar  = document.getElementById('bootBar');
  const hint = document.getElementById('bootHint');

  const START = performance.now();
  const MIN_DURATION = 1500;
  const MIN_WIDTH = 1024;

  let pct = 0;
  let pageLoaded = (document.readyState === 'complete');
  let completed = false;
  let tickTimer = null;

  const isNarrow = () => window.innerWidth < MIN_WIDTH;

  function startTick() {
    if (tickTimer) return;
    const step = () => {
      tickTimer = null;
      if (completed || isNarrow() || pct >= 90) return;
      pct = Math.min(90, pct + Math.random() * 5 + 1.2);
      fill.style.width = pct + '%';
      tickTimer = setTimeout(step, 90);
    };
    step();
  }

  function finishLoad() {
    if (completed || isNarrow()) return;
    const wait = Math.max(0, MIN_DURATION - (performance.now() - START));

    setTimeout(() => {
      if (completed || isNarrow()) return;
      completed = true;
      pct = 100;
      fill.style.width = '100%';
      setTimeout(() => {
        if (!isNarrow()) boot.classList.add('hide');
      }, 380);
    }, wait);
  }

  function sync() {
    if (isNarrow()) {
      bar.style.display = 'none';
      hint.style.display = 'block';
      boot.classList.remove('hide');
      return;
    }
    bar.style.display = 'block';
    hint.style.display = 'none';

    if (completed) {
      boot.classList.add('hide');
      return;
    }
    boot.classList.remove('hide');
    startTick();
    if (pageLoaded) finishLoad();
  }

  window.addEventListener('load', () => {
    pageLoaded = true;
    sync();
  });
  window.addEventListener('resize', sync);

  if (document.readyState === 'complete') pageLoaded = true;
  sync();
})();