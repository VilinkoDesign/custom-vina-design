"use strict";

const STORAGE_KEY = 'customvina.state.v1';

const TYPE_NAMES = {
  rect: 'Rect', solid: 'Solid', glass: 'Glass',
  text: 'Text', icon: 'Icon', image: 'Image',
  button: 'Button', group: 'Group'
};

const ACTIONS = [
  { value: '',                                            label: '（无）' },
  { value: 'pogget.action.view.toggle',                   label: 'view.toggle' },
  { value: 'pogget.action.view.list',                     label: 'view.list' },
  { value: 'pogget.action.view.grid',                     label: 'view.grid' },
  { value: 'pogget.action.container.toggleCollapse',      label: 'container.toggleCollapse' },
  { value: 'pogget.action.container.menu',                label: 'container.menu' },
  { value: 'pogget.action.container.tagMenu',             label: 'container.tagMenu' },
  { value: 'pogget.action.container.pin',                 label: 'container.pin' },
  { value: 'pogget.action.container.personalization',     label: 'container.personalization' },
  { value: 'pogget.action.container.inlineBack',          label: 'container.inlineBack' },
  { value: 'pogget.action.container.inlineHome',          label: 'container.inlineHome' },
  { value: 'pogget.action.container.toggleInlineSearch',  label: 'container.toggleInlineSearch' }
];

const ACTION_LABELS = {
  'pogget.action.view.toggle':                  '切换列表 / 图标视图',
  'pogget.action.view.list':                    '切换到列表视图',
  'pogget.action.view.grid':                    '切换到图标视图',
  'pogget.action.container.toggleCollapse':     '折叠 / 展开收纳盒',
  'pogget.action.container.menu':               '打开收纳盒菜单',
  'pogget.action.container.tagMenu':            '打开颜色标签菜单',
  'pogget.action.container.pin':                '固定 / 取消固定',
  'pogget.action.container.personalization':    '打开个性化面板',
  'pogget.action.container.inlineBack':         '内联视图后退',
  'pogget.action.container.inlineHome':         '回到内联主页',
  'pogget.action.container.toggleInlineSearch': '打开 / 关闭内联搜索'
};

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

/* =========================================================
   状态
   ========================================================= */
const state = {
  elements: [],
  selectedId: null,
  boardW: 360,
  boardH: 480,
  running: false
};

/* =========================================================
   画布视图缩放状态
   ========================================================= */
let canvasScale = 1;

const CANVAS_SCALE_MIN = 0.25;
const CANVAS_SCALE_MAX = 2;
const CANVAS_SCALE_STEP = 0.1;

const canvasWrap = document.getElementById('canvasWrap');

function applyCanvasScale() {
  board.style.transform = `scale(${canvasScale})`;
}

function setCanvasScale(value) {
  canvasScale = clamp(
    round(value, 3),
    CANVAS_SCALE_MIN,
    CANVAS_SCALE_MAX
  );

  applyCanvasScale();
}

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
const board      = document.getElementById('board');
const boardEmpty = document.getElementById('boardEmpty');
const compList   = document.getElementById('compList');
const inspBody   = document.getElementById('inspBody');
const modalMask  = document.getElementById('modalMask');
const codeOut    = document.getElementById('codeOut');
const runBtn     = document.getElementById('runBtn');
const runIcon    = document.getElementById('runIcon');
const runText    = document.getElementById('runText');

/* =========================================================
   状态持久化（localStorage）
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
  } catch (e) {
    /* 存储失败静默处理，避免雪崩 */
  }
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
  } catch (e) {
    /* 忽略损坏的缓存，走空编辑流程 */
  }
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
      el.w = 140; el.h = 90;
      Object.assign(p, {
        z: 1, radius: 12,
        background: ACCENT_HEX, fillOpacity: 0.08,
        border: 1, borderColor: ACCENT_HEX, borderOpacity: 0.6
      });
      break;
    case 'solid':
      el.w = 140; el.h = 60;
      Object.assign(p, {
        z: 1, radius: 12,
        background: '#111111', fillOpacity: 0.85
      });
      break;
    case 'glass':
      el.w = 180; el.h = 72;
      Object.assign(p, {
        z: 1, radius: 12,
        background: '#ffffff', fillOpacity: 0.35,
        border: 1, borderColor: ACCENT_HEX, borderOpacity: 0.35,
        glassRenderer: 'standard', glassOpacity: 0.8
      });
      break;
    case 'text':
      el.w = 140; el.h = 24;
      Object.assign(p, {
        z: 2, label: 'CustomVina',
        textSize: 14, color: '#111111',
        font: 'Segoe UI', align: 'center', textLiteral: true
      });
      break;
    case 'icon':
      el.w = 32; el.h = 32;
      Object.assign(p, {
        z: 2, icon: '★', textSize: 16,
        color: '#111111', font: 'Font Awesome 6 Free Solid'
      });
      break;
    case 'image':
      el.w = 96; el.h = 96;
      Object.assign(p, { z: 1, radius: 12, source: '', imageFit: 'cover' });
      break;
    case 'button':
      el.w = 32; el.h = 32;
      Object.assign(p, {
        z: 10, radius: 12,
        background: ACCENT_HEX, fillOpacity: 1,
        border: 0, borderColor: ACCENT_HEX, borderOpacity: 1,
        icon: '▦', textSize: 14, color: '#ffffff',
        action: 'pogget.action.view.toggle'
      });
      break;
    case 'group':
      el.w = 160; el.h = 100;
      Object.assign(p, { z: 1, clip: false });
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

  if (p.radius != null) body.style.borderRadius = p.radius + 'px';

  switch (el.type) {
    case 'rect':
      body.style.background = toRgba(p.background, p.fillOpacity);
      if (p.border) body.style.border = `${p.border}px solid ${toRgba(p.borderColor, p.borderOpacity)}`;
      break;
    case 'solid':
      body.style.background = toRgba(p.background, p.fillOpacity);
      break;
    case 'button':
      body.classList.add('is-button');
      body.style.background = toRgba(p.background, p.fillOpacity);
      if (p.border) body.style.border = `${p.border}px solid ${toRgba(p.borderColor, p.borderOpacity)}`;
      body.style.color = p.color;
      body.style.fontSize = p.textSize + 'px';
      body.textContent = p.icon || '';
      break;
    case 'glass':
      body.style.background =
        `repeating-linear-gradient(45deg, ${toRgba(p.borderColor || ACCENT_HEX, .16)} 0 1px, transparent 1px 7px), ` +
        toRgba(p.background, p.fillOpacity);
      body.style.border = `${p.border || 1}px solid ${toRgba(p.borderColor || ACCENT_HEX, p.borderOpacity)}`;
      break;
    case 'text':
      body.style.display = 'flex';
      body.style.alignItems = 'center';
      body.style.justifyContent =
        p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center';
      body.style.color = p.color;
      body.style.fontSize = p.textSize + 'px';
      body.style.fontFamily = p.font || 'Segoe UI';
      body.style.lineHeight = '1.2';
      body.textContent = p.label;
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
      break;
  }
}

function renderElement(el) {
  const node = ensureNode(el);
  node.style.left   = el.x + 'px';
  node.style.top    = el.y + 'px';
  node.style.width  = el.w + 'px';
  node.style.height = el.h + 'px';
  node.style.zIndex = el.props.z != null ? el.props.z : 1;
  node.classList.toggle('selected', !state.running && state.selectedId === el.id);
  node.dataset.action = el.props.action || '';
  styleBody(node._body, el);
  scheduleSave();
}

function renderAll() {
  state.elements.forEach(renderElement);
  updateEmptyHint();
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
   组件库（Pointer Events 版本，鼠标 / 触屏 / 手写笔通用）
   ========================================================= */
function buildComponentList() {
  COMPONENTS.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comp-item';
    item.dataset.type = c.type;
    item.innerHTML =
      `<span class="comp-glyph">${c.glyph}</span>
       <span class="comp-meta">
         <span class="comp-name">${c.name}</span><br>
         <span class="comp-type">${c.type}</span>
       </span>`;

    item.addEventListener('pointerdown', e => {
      if (state.running) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;

      let ghost = null;
      let activated = false;
      const THRESHOLD = 6; /* 拖拽阈值，避免点击误触发 */

      function onMove(ev) {
        if (ev.pointerId !== pointerId) return;

        if (!activated) {
          const d = Math.hypot(ev.clientX - startX, ev.clientY - startY);
          if (d < THRESHOLD) return;
          activated = true;

          ghost = document.createElement('div');
          ghost.className = 'drag-ghost';
          ghost.textContent = c.name;
          document.body.appendChild(ghost);

          item.classList.add('dragging');
        }

        ghost.style.left = ev.clientX + 'px';
        ghost.style.top  = ev.clientY + 'px';

        const r = board.getBoundingClientRect();
        const inside =
          ev.clientX >= r.left && ev.clientX <= r.right &&
          ev.clientY >= r.top  && ev.clientY <= r.bottom;
        board.classList.toggle('drag-over', inside);
      }

      function onEnd(ev) {
        if (ev.pointerId !== pointerId) return;

        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);

        item.classList.remove('dragging');
        board.classList.remove('drag-over');

        if (ghost) {
          ghost.remove();
          ghost = null;
        }

        if (!activated) return;
        if (ev.type === 'pointercancel') return;

        const r = board.getBoundingClientRect();
        if (ev.clientX < r.left || ev.clientX > r.right ||
            ev.clientY < r.top  || ev.clientY > r.bottom) {
          return;
        }

        /* boardPos 已考虑 canvasScale，得到画布原始坐标 */
        const pos = boardPos(ev);
        const el = makeElement(c.type, 0, 0);
        el.x = Math.round(clamp(pos.x - el.w / 2, 0, Math.max(0, state.boardW - el.w)));
        el.y = Math.round(clamp(pos.y - el.h / 2, 0, Math.max(0, state.boardH - el.h)));

        state.elements.push(el);
        renderElement(el);
        updateEmptyHint();
        select(el.id);
        saveState();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);

      e.preventDefault();
    });

    compList.appendChild(item);
  });
}

function boardPos(evt) {
  const r = board.getBoundingClientRect();

  return {
    x: (evt.clientX - r.left) / canvasScale,
    y: (evt.clientY - r.top) / canvasScale
  };
}

/* =========================================================
   鼠标滚轮缩放画布
   ========================================================= */
canvasWrap.addEventListener('wheel', e => {
  e.preventDefault();

  if (drag) return;

  const direction = e.deltaY < 0 ? 1 : -1;
  const nextScale = canvasScale + direction * CANVAS_SCALE_STEP;

  setCanvasScale(nextScale);
}, { passive: false });

/* =========================================================
   触屏双指捏合缩放画布
   ========================================================= */
const touchPointers = new Map();

let pinchState = null;

function getPointerDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(dx * dx + dy * dy);
}

canvasWrap.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;

  /* 捕获触摸指针，确保手指移出画布后仍能接收事件 */
  try {
    canvasWrap.setPointerCapture(e.pointerId);
  } catch (err) {}

  touchPointers.set(e.pointerId, {
    x: e.clientX,
    y: e.clientY
  });

  if (touchPointers.size === 2) {
    /* 双指操作优先于组件拖动 */
    drag = null;
    pinchState = null;

    const points = Array.from(touchPointers.values());
    const distance = getPointerDistance(points[0], points[1]);

    if (distance > 0) {
      pinchState = {
        startDistance: distance,
        startScale: canvasScale
      };
    }
  }
}, { passive: true });

canvasWrap.addEventListener('pointermove', e => {
  if (e.pointerType !== 'touch') return;
  if (!touchPointers.has(e.pointerId)) return;

  touchPointers.set(e.pointerId, {
    x: e.clientX,
    y: e.clientY
  });

  if (touchPointers.size !== 2 || !pinchState) return;

  const points = Array.from(touchPointers.values());
  const distance = getPointerDistance(points[0], points[1]);

  if (pinchState.startDistance <= 0) return;

  const ratio = distance / pinchState.startDistance;

  setCanvasScale(pinchState.startScale * ratio);

  e.preventDefault();
}, { passive: false });

function endTouchPointer(e) {
  if (e.pointerType !== 'touch') return;

  touchPointers.delete(e.pointerId);

  if (touchPointers.size < 2) {
    pinchState = null;
  }
}

canvasWrap.addEventListener('pointerup', endTouchPointer);
canvasWrap.addEventListener('pointercancel', endTouchPointer);
canvasWrap.addEventListener('lostpointercapture', endTouchPointer);

/* =========================================================
   拖动 / 缩放
   ========================================================= */
let drag = null;

board.addEventListener('pointerdown', e => {
  if (state.running) return;

  /* 鼠标只响应左键；触屏 / 手写笔不限制 button */
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  /* 已有拖动进行中，或正在双指缩放，忽略新的指针 */
  if (drag) return;
  if (pinchState) return;

  const node = e.target.closest('.el');
  if (!node) {
    select(null);
    return;
  }

  const el = getElement(node.dataset.id);
  if (!el) return;

  if (state.selectedId !== el.id) select(el.id);

  const pos = boardPos(e);
  const isResize = !!e.target.closest('.resize-handle');

  drag = {
    mode: isResize ? 'resize' : 'move',
    pointerId: e.pointerId,   /* 记录发起拖动的那根指针 */
    el,
    startX: pos.x,
    startY: pos.y,
    origX: el.x,
    origY: el.y,
    origW: el.w,
    origH: el.h
  };

  e.preventDefault();
});

window.addEventListener('pointermove', e => {
  if (!drag) return;

  /* 只处理发起拖动的那根指针，避免多指干扰 */
  if (e.pointerId !== drag.pointerId) return;

  const pos = boardPos(e);
  const dx = pos.x - drag.startX;
  const dy = pos.y - drag.startY;
  const el = drag.el;

  if (drag.mode === 'move') {
    el.x = Math.round(clamp(drag.origX + dx, -el.w + 16, state.boardW - 16));
    el.y = Math.round(clamp(drag.origY + dy, -el.h + 16, state.boardH - 16));
  } else {
    el.w = Math.round(Math.max(8, drag.origW + dx));
    el.h = Math.round(Math.max(8, drag.origH + dy));
  }

  renderElement(el);
  syncLayoutInputs(el);
});

function endDrag(e) {
  if (!drag) return;
  /* 只清理发起拖动的那根指针 */
  if (e && e.pointerId !== drag.pointerId) return;
  drag = null;
  saveState();
}

function syncLayoutInputs(el) {
  const map = { x: el.x, y: el.y, w: el.w, h: el.h };
  inspBody.querySelectorAll('input[data-key]').forEach(inp => {
    const k = inp.dataset.key;
    if (!k) return;
    if (k in map && document.activeElement !== inp) {
      inp.value = map[k];
    }
  });
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

/* =========================================================
   属性面板
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
  addField(inspBody, '层级 z', numInput(p.z != null ? p.z : 1, v => { p.z = Math.round(v); renderElement(el); }, { step: 1 }));

  addSection(inspBody, '外观');
  if (p.radius != null) {
    addField(inspBody, '圆角 radius', rangeInput(p.radius, v => { p.radius = v; renderElement(el); }, { min: 0, max: 48, step: 1 }));
  }
  if (p.background != null) {
    addField(inspBody, '背景色', colorInput(p.background, v => { p.background = v; renderElement(el); }));
  }
  if (p.fillOpacity != null) {
    addField(inspBody, '不透明度', rangeInput(p.fillOpacity, v => { p.fillOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
  }
  if (p.border != null) {
    addField(inspBody, '边框 border', rangeInput(p.border, v => { p.border = v; renderElement(el); }, { min: 0, max: 8, step: 1 }));
    addField(inspBody, '边框色', colorInput(p.borderColor, v => { p.borderColor = v; renderElement(el); }));
    addField(inspBody, '边框透明度', rangeInput(p.borderOpacity, v => { p.borderOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
  }

  if (el.type === 'text') {
    addSection(inspBody, '文字');
    addField(inspBody, '内容 label', textInput(p.label, v => { p.label = v; renderElement(el); }));
    addField(inspBody, '字号', rangeInput(p.textSize, v => { p.textSize = v; renderElement(el); }, { min: 8, max: 48, step: 1 }));
    addField(inspBody, '颜色', colorInput(p.color, v => { p.color = v; renderElement(el); }));
    addField(inspBody, '对齐', selectInput(p.align, [
      { value: 'left', label: '左对齐' },
      { value: 'center', label: '居中' },
      { value: 'right', label: '右对齐' }
    ], v => { p.align = v; renderElement(el); }));
    addField(inspBody, '字体', textInput(p.font, v => { p.font = v; renderElement(el); }));
  }

  if (el.type === 'icon' || el.type === 'button') {
    addSection(inspBody, '图标');
    addField(inspBody, '图标字符', textInput(p.icon, v => { p.icon = v; renderElement(el); }));
    addField(inspBody, '字号', rangeInput(p.textSize, v => { p.textSize = v; renderElement(el); }, { min: 8, max: 48, step: 1 }));
    addField(inspBody, '颜色', colorInput(p.color, v => { p.color = v; renderElement(el); }));
  }

  if (el.type === 'image') {
    addSection(inspBody, '图片');
    addField(inspBody, 'source', textInput(p.source, v => { p.source = v; renderElement(el); }));
    addField(inspBody, 'imageFit', selectInput(p.imageFit, [
      { value: 'cover', label: 'cover' },
      { value: 'contain', label: 'contain' },
      { value: 'fill', label: 'fill' }
    ], v => { p.imageFit = v; renderElement(el); }));
  }

  if (el.type === 'glass') {
    addSection(inspBody, '玻璃');
    addField(inspBody, 'glassRenderer', selectInput(p.glassRenderer, [
      { value: 'standard', label: 'standard' },
      { value: 'liquid', label: 'liquid' }
    ], v => { p.glassRenderer = v; }));
    addField(inspBody, 'glassOpacity', rangeInput(p.glassOpacity, v => { p.glassOpacity = v; renderElement(el); }, { min: 0, max: 1, step: 0.01 }));
  }

  addSection(inspBody, '交互');
  addField(inspBody, 'interaction', selectInput(p.interaction || '', [
    { value: '', label: '（无）' },
    { value: 'title', label: 'title' },
    { value: 'icon', label: 'icon' }
  ], v => { p.interaction = v || undefined; }));

  addField(inspBody, 'action', selectInput(p.action || '', ACTIONS, v => {
    p.action = v || undefined;
    renderElement(el);
  }));

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

    if (p.z != null) attrs.push(['z', p.z]);
    if (p.interaction) attrs.push(['interaction', `"${p.interaction}"`]);

    if (p.radius != null) attrs.push(['radius', p.radius]);
    if (p.background != null) attrs.push(['background', toRgbStr(p.background)]);
    if (p.fillOpacity != null) attrs.push(['fillOpacity', round(p.fillOpacity, 2)]);

    if (p.border != null) {
      attrs.push(['border', p.border]);
      if (p.borderColor) attrs.push(['borderColor', toRgbStr(p.borderColor)]);
      if (p.borderOpacity != null) attrs.push(['borderOpacity', round(p.borderOpacity, 2)]);
    }

    if (el.type === 'glass') {
      if (p.glassRenderer) attrs.push(['glassRenderer', `"${p.glassRenderer}"`]);
      if (p.glassOpacity != null) attrs.push(['glassOpacity', round(p.glassOpacity, 2)]);
      if (p.glassBorder != null) attrs.push(['glassBorder', p.glassBorder]);
    }

    if (el.type === 'text') {
      attrs.push(['label', `"${escapeStr(p.label)}"`]);
      attrs.push(['textLiteral', true]);
      attrs.push(['textSize', p.textSize]);
      attrs.push(['color', toRgbStr(p.color)]);
      if (p.font) attrs.push(['font', `"${p.font}"`]);
      if (p.align) attrs.push(['align', `"${p.align}"`]);
    }

    if (el.type === 'icon' || el.type === 'button') {
      attrs.push(['icon', `"${escapeStr(p.icon)}"`]);
      if (p.textSize) attrs.push(['textSize', p.textSize]);
      if (p.color) attrs.push(['color', toRgbStr(p.color)]);
      if (p.font) attrs.push(['font', `"${p.font}"`]);
    }

    if (el.type === 'image') {
      if (p.source) attrs.push(['source', `"${escapeStr(p.source)}"`]);
      if (p.imageFit) attrs.push(['imageFit', `"${p.imageFit}"`]);
    }

    if (el.type === 'group' && p.clip) attrs.push(['clip', true]);
    if (p.action) attrs.push(['action', p.action]);

    lines.push(compName(el) + ' {');
    lines.push('  view {');
    attrs.forEach((pair, i) => {
      const comma = i < attrs.length - 1 ? ',' : '';
      lines.push(`    ${pair[0]}: ${pair[1]}${comma}`);
    });
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
   版本信息弹窗
   ========================================================= */
const versionBadge = document.getElementById('versionBadge');
const versionMask  = document.getElementById('versionMask');
const versionClose = document.getElementById('versionClose');
const versionOk    = document.getElementById('versionOk');

function openVersion() {
  versionMask.classList.add('show');
}
function closeVersion() {
  versionMask.classList.remove('show');
}

versionBadge.addEventListener('click', openVersion);
versionOk.addEventListener('click', closeVersion);
versionMask.addEventListener('click', e => {
  if (e.target === versionMask) closeVersion();
});

/* =========================================================
   调试：连续点击版权文本 5 次触发崩溃
   ========================================================= */
(function installCrashTrigger() {
  const el = document.getElementById('copyrightEl');
  if (!el) return;

  let clicks = 0;
  let timer = null;

  el.addEventListener('click', () => {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 1200);

    if (clicks >= 5) {
      clicks = 0;
      /* 故意产生一次控制台错误以触发崩溃兜底 */
      console.error('[DEBUG] Manual crash triggered via copyright click');
    }
  });
})();

/* =========================================================
   输入属性变化后保存
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

  buildComponentList();
  applyBoardSize();

  /* 初始化画布缩放 */
  setCanvasScale(1);

  updateEmptyHint();
  renderInspector();
}
init();

/* 关闭页面前做一次同步保存 */
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