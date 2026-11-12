import * as V from "./vina-core.js";
import * as M from "./vina-model.js";
import { projectFromLink } from "./vina-link.js";
import { openBehaviorEditor } from "./vina-behavior-editor.js";
import { showDialog, closeDialog } from "./vina-dialog.js";
import * as I from "./vina-interactions.js";
import { renderScene } from "./vina-renderer.js";
import { hitFrame } from "./vina-preview.js";
import {
  orderedLayers,
  numberStep,
  stepNumber,
  resizeCorner,
  propertyGroups,
} from "./vina-editor.js";
import { pickScene, hasVisiblePaint } from "./vina-canvas.js";
import { icon, COMPONENT_ICONS } from "./icons.js";
import {
  isHostPreset,
  previewInputs,
  hostPreviewInputs,
} from "./vina-scene.js";
const $ = (id) => document.getElementById(id);
const STORAGE = "customvina.project.v2",
  RECOVERY = "customvina.recovery.v2";
const NAMES = {
  rect: "矩形",
  solid: "实色块",
  glass: "模糊层",
  text: "文字",
  icon: "图标",
  image: "图片",
  button: "按钮",
  group: "分组",
  path: "路径",
  content: "应用内容",
  container: "容器",
  rectangle: "矩形",
};
let project = V.createProject(),
  history = new V.History(project),
  selection = [],
  running = false,
  zoom = 1,
  scene = null,
  drag = null,
  clipboard = null,
  inspectorTab = "properties",
  inputMode = "project",
  saved = true,
  pending = null;
let standard,
  schema,
  defaults,
  currentInputs = {},
  runtimeOverrides = {},
  lastSelection = [],
  busy = false,
  lastError = "",
  importRevision = 0;
const collapsed = new Set();
const hoverStates = new Map();
let previewFrame = 0;
let hostState = "expanded",
  hostOverrides = {},
  lastHostPreset = false;
let variableSearch = "",
  dependenciesExpanded = false;
function element(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
function button(text, handler, className = "mini-btn", title = text) {
  const n = element("button", className, text);
  n.type = "button";
  n.title = title;
  n.addEventListener("click", handler);
  return n;
}
function iconButton(name, handler, className, label) {
  const n = button("", handler, className, label);
  n.setAttribute("aria-label", label);
  n.append(icon(name));
  return n;
}
function toast(message) {
  const n = element("div", "toast", message);
  n.setAttribute("role", "status");
  document.body.append(n);
  requestAnimationFrame(() => n.classList.add("show"));
  setTimeout(() => {
    n.classList.remove("show");
    setTimeout(() => n.remove(), 250);
  }, 3000);
}
function status(message, error = false) {
  $("statusText").textContent = message;
  $("statusText").classList.toggle("error", error);
}
const idx = () => V.index(project.doc);
const selected = () =>
  selection.map((id) => idx().byId.get(id)).filter(Boolean);
function inputValues(target = project) {
  const inputs = previewInputs(
    defaults,
    target.board,
    document.documentElement.dataset.theme === "dark",
    isHostPreset(target.doc),
    hostState,
    { ...hostOverrides, ...runtimeOverrides },
  );
  if (isHostPreset(target.doc) && hostState === "search") {
    try {
      return hostPreviewInputs(
        M.effectiveProject(target, standard),
        inputs,
        hostState,
      );
    } catch {
      /* Missing dependencies are reported by the document validator. */
    }
  }
  return inputs;
}
function effective() {
  return M.effectiveProject(project, standard);
}
function modelInputs() {
  const result = { ...currentInputs },
    own = idx().byPath;
  if (!scene) return result;
  for (const [path, p] of scene.runtime.idx.byPath)
    if (p.kind === "property" && !own.has(path)) {
      try {
        result[path] = scene.runtime.get(path);
      } catch {}
    }
  for (const [path, target] of scene.runtime.aliases)
    if (!own.has(target)) {
      try {
        result[path] = scene.runtime.get(path);
      } catch {}
    }
  return result;
}
function save() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(project));
    saved = true;
    $("saveStatus").textContent = "已保存到本地";
  } catch {
    saved = false;
    $("saveStatus").textContent = "本地空间不足，请导出工程";
  }
}
function checkpoint() {
  try {
    localStorage.setItem(
      RECOVERY,
      JSON.stringify(history.entries[history.position]),
    );
  } catch {}
}
function markCommitted(label) {
  if (history.commit(project, label)) {
    save();
    status(label);
  }
  syncHistory();
}
function syncHistory() {
  if (!history) return;
  $("undoBtn").disabled = running || (!pending && !history.canUndo);
  $("redoBtn").disabled = running || !!pending || !history.canRedo;
  $("newBtn").disabled = running || busy;
  document.querySelectorAll("[data-command]").forEach((n) => {
    n.disabled = running;
  });
}
function flush() {
  if (!pending) return true;
  const before = pending;
  pending = null;
  try {
    M.validate(project, standard, inputValues(), schema);
    markCommitted("修改属性");
    return true;
  } catch (error) {
    project = before;
    renderAll();
    toast(error.message);
    return false;
  }
}
function mutate(label, fn, { allowMissingBase = false } = {}) {
  if (running || busy) return false;
  flush();
  const next = V.clone(project),
    oldSelection = [...selection];
  try {
    fn(next);
    try {
      M.validate(next, standard, inputValues(next), schema);
    } catch (error) {
      if (!allowMissingBase || !error.message.startsWith("缺少基础预设"))
        throw error;
    }
    project = next;
    selection = selection.filter((id) => idx().byId.has(id));
    checkpoint();
    markCommitted(label);
    renderAll();
    return true;
  } catch (error) {
    selection = oldSelection;
    lastError = error.message;
    toast(error.message);
    return false;
  }
}
function undo(redo = false) {
  if (running) return;
  flush();
  const next = redo ? history.redo() : history.undo();
  if (!next) return;
  project = next;
  selection = selection.filter((id) => idx().byId.has(id));
  runtimeOverrides = {};
  save();
  renderAll();
  status(redo ? "已重做" : "已撤销");
}
function select(ids, add = false) {
  if (running) return;
  flush();
  selection = add ? [...new Set([...selection, ...ids])] : ids;
  renderCanvas();
  renderLayers();
  renderInspector();
}
function theme(mode) {
  if (!["system", "light", "dark"].includes(mode)) mode = "system";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme =
    mode === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  const dark = document.documentElement.dataset.theme === "dark";
  const label = dark ? "切换至浅色模式" : "切换至深色模式";
  $("themeBtn").replaceChildren(icon(dark ? "sun" : "moon"));
  $("themeBtn").setAttribute("aria-label", label);
  $("themeBtn").title = label + (mode === "system" ? "（当前跟随系统）" : "");
  try {
    localStorage.setItem("customvina.theme", mode);
  } catch {}
  if (standard && history) {
    flush();
    renderAll();
  } else if (standard) renderCanvas();
}
function renderCanvas() {
  const host = isHostPreset(project.doc);
  if (host !== lastHostPreset) {
    $("showBase").checked = host;
    lastHostPreset = host;
  }
  $("previewState").hidden = !host;
  $("previewSettingsBtn").hidden = !host;
  $("board").classList.toggle("host-preview", host);
  $("board").style.width = project.board.w + "px";
  $("board").style.height = project.board.h + "px";
  $("board").style.transform = `scale(${zoom})`;
  $("boardSizer").style.width = project.board.w * zoom + "px";
  $("boardSizer").style.height = project.board.h * zoom + "px";
  currentInputs = inputValues();
  $("scene").style.background = host
    ? V.colorHex(currentInputs["pogget.theme.darknight"])
    : "";
  try {
    const next = renderScene(effective(), currentInputs, {
      editable: new Set(idx().byId.keys()),
      showBase: $("showBase").checked,
      host: host && hostState !== "all",
      hostState,
      selection,
      running,
      locks: project.locks,
      hover: running
        ? new Map([...hoverStates].map(([id, s]) => [id, s.value]))
        : new Map(),
      defaults: {
        ...FALLBACK,
        background: currentInputs["pogget.theme.midnight"],
        color: currentInputs["pogget.theme.white"],
        borderColor: currentInputs["pogget.theme.white"],
      },
      bounds: schema.bounds,
    });
    // Keep wrappers during preview so a hover update cannot cancel capture or
    // synthesize leave/enter loops by replacing the element under the pointer.
    if (
      running &&
      scene &&
      next.nodes.size === scene.nodes.size &&
      [...next.nodes.keys()].every((id) => scene.nodes.has(id))
    ) {
      for (const [id, fresh] of next.nodes) {
        const old = scene.nodes.get(id);
        old.style.cssText = fresh.style.cssText;
        old.className = fresh.className;
        old
          .querySelector(":scope > .el-body")
          .replaceWith(fresh.querySelector(":scope > .el-body"));
        old._children.style.cssText = fresh._children.style.cssText;
      }
      next.nodes = scene.nodes;
    } else $("scene").replaceChildren(next.fragment);
    scene = next;
    const empty = ![...scene.frames.values()].some((f) => f.rendered);
    $("boardEmpty").style.display = empty ? "flex" : "none";
    renderOverlays();
    syncHistory();
  } catch (error) {
    status(error.message, true);
    $("boardEmpty").style.display = scene?.nodes.size ? "none" : "flex";
  }
}
function animatePreview(time) {
  previewFrame = 0;
  if (!running) return;
  let active = false;
  for (const [id, s] of hoverStates) {
    const elapsed = s.duration
      ? Math.min(1, (time - s.start) / (s.duration * 1000))
      : 1;
    s.value = s.from + (s.target - s.from) * elapsed;
    runtimeOverrides[s.path + ".hoverProgress"] = s.value;
    if (elapsed < 1) active = true;
  }
  renderCanvas();
  if (active) previewFrame = requestAnimationFrame(animatePreview);
}
function trackHover(point) {
  if (!running || !scene) return;
  const time = performance.now();
  let changed = false;
  if (isHostPreset(project.doc)) {
    const x = point?.x ?? -9999,
      y = point?.y ?? -9999;
    changed =
      runtimeOverrides["pogget.containerFrame.pointerX"] !== x ||
      runtimeOverrides["pogget.containerFrame.pointerY"] !== y;
    runtimeOverrides["pogget.containerFrame.pointerX"] = x;
    runtimeOverrides["pogget.containerFrame.pointerY"] = y;
  }
  for (const [id, f] of scene.frames) {
    if (!f.rendered) continue;
    let on = point ? hitFrame(scene, id, point) : false;
    const region = V.block(f.node, "hoverRegion"),
      state = hoverStates.get(id);
    if (region && point && f.visible && f.enabled && f.alpha > 0.001) {
      const path = f.path + ".hoverRegion",
        get = (key, fallback) => scene.runtime.get(path + "." + key, fallback),
        retained = state?.target === 1;
      const x = get(retained ? "retainX" : "x", get("x", f.x)),
        y = get(retained ? "retainY" : "y", get("y", f.y)),
        w = get(retained ? "retainWidth" : "width", get("width", f.w)),
        h = get(retained ? "retainHeight" : "height", get("height", f.h));
      on =
        get("enabled", true) &&
        point.x >= x &&
        point.y >= y &&
        point.x <= x + w &&
        point.y <= y + h;
    }
    if ((state?.target || 0) === (on ? 1 : 0)) continue;
    const value = state?.value || 0,
      duration = on
        ? (f.p.transition ?? 0.2)
        : (f.p.unhoverTransition ?? f.p.transition ?? 0.2);
    hoverStates.set(id, {
      value,
      from: value,
      target: on ? 1 : 0,
      start: time,
      duration,
      path: f.path,
    });
    runtimeOverrides[f.path + ".hovered"] = on;
    changed = true;
  }
  if (changed && !previewFrame)
    previewFrame = requestAnimationFrame(animatePreview);
}
function renderOverlays() {
  $("overlays").replaceChildren();
  if (running || !scene) return;
  for (const id of selection) {
    const f = scene.frames.get(id);
    if (!f) continue;
    const outline = element("div", "selection-box");
    outline.dataset.id = id;
    outline.style.cssText = `left:${f.paintX}px;top:${f.paintY}px;width:${f.w}px;height:${f.h}px`;
    if (!isLocked(id)) {
      for (const [corner, label] of [
        ["nw", "左上角"],
        ["ne", "右上角"],
        ["sw", "左下角"],
        ["se", "右下角"],
      ]) {
        const resize = element("div", "resize-handle");
        resize.dataset.resize = id;
        resize.dataset.corner = corner;
        resize.setAttribute("aria-label", "调整尺寸 · " + label);
        outline.append(resize);
      }
    }
    $("overlays").append(outline);
  }
  if (
    selection.length === 1 &&
    scene.frames.get(selection[0])?.p.type === "path" &&
    !isLocked(selection[0])
  )
    renderPathPoints(selection[0]);
}
function renderPathPoints(id) {
  const f = scene.frames.get(id);
  let points;
  try {
    points = V.parsePoints(f.p.points, f.p.closed ?? true);
  } catch {
    return;
  }
  points.forEach((point, i) => {
    const dot = button(
      "",
      () => {},
      "path-point",
      `点 ${i + 1}：${point.x}, ${point.y} · 双击删除`,
    );
    dot.dataset.point = String(i);
    dot.dataset.id = id;
    dot.style.left = f.x + (point.x / (f.p.pathWidth || 100)) * f.w + "px";
    dot.style.top = f.y + (point.y / (f.p.pathHeight || 100)) * f.h + "px";
    dot.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      mutate("删除路径点", (next) => {
        const node = V.index(next.doc).byId.get(id);
        const pts = V.parsePoints(
          scene.frames.get(id).p.points,
          f.p.closed ?? true,
        );
        pts.splice(i, 1);
        V.parsePoints(V.pointsText(pts), f.p.closed ?? true);
        V.setValue(node, "points", V.pointsText(pts));
      });
    });
    $("overlays").append(dot);
  });
}
function renderAll() {
  renderCanvas();
  renderLayers();
  renderInspector();
  syncHistory();
  $("boardWInput").value = project.board.w;
  $("boardHInput").value = project.board.h;
}
function isLocked(id) {
  const i = idx();
  return (
    project.locks.includes(id) ||
    M.ancestors(i, id).some((n) => project.locks.includes(n.id))
  );
}
function renderLayers() {
  const tree = $("layerTree");
  tree.replaceChildren();
  const filter = $("layerSearch").value.toLowerCase(),
    i = idx(),
    views = orderedLayers(project.doc, scene?.frames || new Map());
  $("layerCount").textContent = views.length ? String(views.length) : "";
  for (const { node, parent, component } of views) {
    const chain = M.ancestors(i, node.id);
    if (!filter && chain.some((n) => collapsed.has(n.id))) continue;
    const path = i.paths.get(node.id),
      name = parent ? node.name : component.name;
    if (filter && !path.toLowerCase().includes(filter)) continue;
    const row = element("div", "layer-row");
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", String(selection.includes(node.id)));
    row.classList.toggle("active", selection.includes(node.id));
    row.style.paddingLeft = 8 + Math.max(0, chain.length - 1) * 14 + "px";
    row.dataset.id = node.id;
    row.dataset.path = path;
    row.draggable = !running;
    const children = node.members.some(
      (m) => m.kind === "block" && !V.META.has(m.name),
    );
    if (children) {
      row.setAttribute("aria-expanded", String(!collapsed.has(node.id)));
      row.append(
        iconButton(
          collapsed.has(node.id) ? "caret-right" : "caret-down",
          (event) => {
            event.stopPropagation();
            if (collapsed.has(node.id)) collapsed.delete(node.id);
            else collapsed.add(node.id);
            renderLayers();
          },
          "layer-toggle",
          collapsed.has(node.id) ? "展开图层" : "折叠图层",
        ),
      );
    } else {
      const glyph = element("span", "layer-toggle layer-glyph");
      glyph.append(
        icon(
          COMPONENT_ICONS[scene?.frames.get(node.id)?.p.type] ||
            "regular-square",
        ),
      );
      row.append(glyph);
    }
    const label = element("span", "layer-name", name);
    label.title = path;
    row.append(label);
    row.append(
      iconButton(
        isLocked(node.id) ? "lock" : "lock-open",
        (event) => {
          event.stopPropagation();
          mutate("切换图层锁定", (next) => {
            next.locks = next.locks.includes(node.id)
              ? next.locks.filter((v) => v !== node.id)
              : [...next.locks, node.id];
          });
        },
        "layer-toggle",
        isLocked(node.id) ? "解锁" : "锁定",
      ),
    );
    row.append(
      iconButton(
        scene?.frames.get(node.id)?.p.visible !== false ? "eye" : "eye-slash",
        (event) => {
          event.stopPropagation();
          mutate("切换可见性", (next) =>
            V.setValue(
              V.index(next.doc).byId.get(node.id),
              "visible",
              scene?.frames.get(node.id)?.p.visible === false,
            ),
          );
        },
        "layer-toggle",
        "切换可见性",
      ),
    );
    row.addEventListener("click", (event) =>
      select([node.id], event.shiftKey || event.ctrlKey || event.metaKey),
    );
    row.addEventListener("dragstart", (event) => {
      if (running) return event.preventDefault();
      if (!selection.includes(node.id)) select([node.id]);
      event.dataTransfer.setData(
        "application/x-vina-layer",
        JSON.stringify(selection),
      );
      event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", (event) => {
      if (event.dataTransfer.types.includes("application/x-vina-layer")) {
        event.preventDefault();
        row.classList.add("drop-target");
      }
    });
    row.addEventListener("dragleave", () =>
      row.classList.remove("drop-target"),
    );
    row.addEventListener("drop", (event) => {
      row.classList.remove("drop-target");
      if (!event.dataTransfer.types.includes("application/x-vina-layer"))
        return;
      event.preventDefault();
      event.stopPropagation();
      const ids = JSON.parse(
        event.dataTransfer.getData("application/x-vina-layer"),
      );
      mutate("移动图层", (next) => {
        if (ids.some(isLocked) || isLocked(node.id))
          throw new Error("请先解锁图层");
        M.reparent(
          next.doc,
          ids,
          scene.frames.get(node.id)?.p.type === "group" ? node.id : parent?.id,
          modelInputs(),
        );
      });
    });
    tree.append(row);
  }
  if (!views.length)
    tree.append(element("p", "panel-hint", "添加组件后在这里管理层级"));
  const unnest = button("移到画板根层", () => command("root"), "root-drop");
  unnest.prepend(icon("arrow-turn-up"));
  unnest.addEventListener("dragover", (e) => e.preventDefault());
  unnest.addEventListener("drop", (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/x-vina-layer");
    if (data)
      mutate("移到根层", (next) =>
        M.reparent(next.doc, JSON.parse(data), null, modelInputs()),
      );
  });
  tree.append(unnest);
}
function section(title) {
  const n = element("div", "insp-section", title);
  $("inspBody").append(n);
  return n;
}
function field(label, control, key = "", target = $("inspBody")) {
  const row = element("div", "field"),
    lb = element("label", "", label);
  lb.title = key || label;
  row.append(lb, control);
  target.append(row);
  return row;
}
function hint(text) {
  $("inspBody").append(element("p", "panel-hint", text));
}
function selectControl(value, options, change) {
  const n = element("select", "ctl");
  for (const o of options) {
    const value = typeof o === "object" ? o.value : o,
      label = typeof o === "object" ? o.label : o,
      opt = element("option", "", label);
    opt.value = value;
    n.append(opt);
  }
  n.value = value ?? "";
  n.addEventListener("change", () => change(n.value));
  return n;
}
function textControl(value, change, type = "text") {
  const n = element("input", "ctl");
  let stepped = false;
  n.type = type;
  n.value = value ?? "";
  n.addEventListener("change", () => {
    stepped = false;
    change(n.value);
  });
  if (type === "number") {
    n.step = String(numberStep("", value));
    const bump = (event, direction) => {
      if (n.disabled || n.readOnly || !Number.isFinite(Number(n.value))) return;
      event.preventDefault();
      const step = Number(n.step) || 0.1,
        scale = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
      n.value = String(
        stepNumber(
          n.value,
          step * scale,
          direction,
          n.min === "" ? -Infinity : Number(n.min),
          n.max === "" ? Infinity : Number(n.max),
        ),
      );
      stepped = true;
      n.dispatchEvent(new Event("input", { bubbles: true }));
    };
    n.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown")
        bump(e, e.key === "ArrowUp" ? 1 : -1);
    });
    n.addEventListener(
      "wheel",
      (e) => {
        if (document.activeElement === n && e.deltaY)
          bump(e, e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    // A focused field is one edit transaction, independent of key repeat speed.
    // Programmatic stepping does not trigger the browser's native blur change.
    n.addEventListener("blur", () => {
      if (stepped) n.dispatchEvent(new Event("change", { bubbles: true }));
    });
    n.title = "方向键或聚焦后滚轮微调；Shift ×10，Alt ÷10";
  }
  return n;
}
const LABELS = {
  x: "X",
  y: "Y",
  width: "宽度",
  height: "高度",
  z: "层级",
  opacity: "不透明度",
  visible: "可见",
  enabled: "启用",
  radius: "圆角",
  background: "背景色",
  fillOpacity: "填充透明度",
  border: "描边宽度",
  borderColor: "描边色",
  borderOpacity: "描边透明度",
  borderStyle: "描边样式",
  borderOnly: "仅描边",
  label: "文字内容",
  color: "文字颜色",
  font: "字体",
  textSize: "字号",
  textLiteral: "按原文显示",
  textX: "文字 X",
  textY: "文字 Y",
  align: "文字对齐",
  texture: "纹理",
  blur: "模糊强度",
  blurRenderer: "模糊后端",
  shadowOpacity: "阴影透明度",
  shadowColor: "阴影颜色",
  shadowX: "阴影 X",
  shadowY: "阴影 Y",
  shadowBlur: "阴影模糊",
  shadowQuality: "阴影质量",
  clip: "裁剪子节点",
  clipRadius: "裁剪圆角",
  clipLayer: "共享裁剪层",
  points: "路径点列",
  closed: "闭合路径",
  smooth: "平滑曲线",
  tension: "曲线张力",
  pathWidth: "路径坐标宽度",
  pathHeight: "路径坐标高度",
  slot: "宿主绘制阶段",
  interaction: "交互范围",
  action: "点击动作",
  holdAction: "长按动作",
  holdDelay: "长按阈值（秒）",
  transition: "进入时长（秒）",
  unhoverTransition: "退出时长（秒）",
  pressDuration: "按下时长（秒）",
  releaseDuration: "释放时长（秒）",
  blendMode: "混合模式",
  source: "资源来源",
  glassRenderer: "高光样式",
  glassOpacity: "模糊层透明度",
  glassBorder: "模糊层描边",
  glassActive: "高光启用",
  glassTintEnabled: "模糊层着色",
  glassTintColor: "着色颜色",
  glassTintAmount: "着色强度",
};
const ENUMS = {
  type: V.TYPES.filter((type) => !type.startsWith("pogget.native.")),
  align: ["left", "center", "right"],
  borderStyle: ["solid", "dash"],
  blendMode: ["normal", "multiply", "linearDodge"],
  glassRenderer: ["standard", "lightEffect"],
  imageRenderer: ["wic", "shell", "resource"],
  imageFit: ["stretch", "contain"],
  clipAntialias: ["perPrimitive", "aliased"],
  textRenderer: ["", "glyph", "dwrite2", "dwrite3", "direct", "resource"],
  interaction: ["", "title", "icon"],
  blurRenderer: ["title", "snapshot"],
};
const BOOLS = new Set([
  "visible",
  "enabled",
  "borderOnly",
  "textLiteral",
  "textNoWrap",
  "textClip",
  "emphasized",
  "clip",
  "clipLayer",
  "closed",
  "smooth",
  "glassActive",
  "glassTintEnabled",
  "glassCustomEdge",
  "textFloatPosition",
  "textColorFont",
  "textAppFonts",
  "imageCrop",
]);
const STRINGS = new Set([
  "label",
  "text",
  "icon",
  "font",
  "source",
  "src",
  "points",
  "slot",
  "interaction",
  "type",
  "tagAlign",
  "toggle",
]);
const COLORS = new Set([
  "background",
  "color",
  "borderColor",
  "shadowColor",
  "textShadowColor",
  "glassTintColor",
]);
const FALLBACK = {
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  z: 0,
  opacity: 1,
  visible: true,
  enabled: true,
  radius: 0,
  background: 0,
  border: 0,
  borderColor: 16777215,
  borderOpacity: 1,
  fillOpacity: 1,
  borderOnly: false,
  borderStyle: "solid",
  blendMode: "normal",
  align: "center",
  texture: false,
  blur: 0,
  blurRenderer: "title",
  shadowOpacity: 0,
  shadowColor: 0,
  shadowX: 0,
  shadowY: 4,
  shadowBlur: 16,
  shadowQuality: 4,
  clip: false,
  clipLayer: false,
  clipRadius: 0,
  clipAntialias: "perPrimitive",
  pathWidth: 100,
  pathHeight: 100,
  tension: 0.25,
  closed: true,
  smooth: false,
  holdDelay: 0.4,
  transition: 0.2,
  unhoverTransition: 0.2,
  pressDuration: 0.15,
  releaseDuration: 0.3,
  contentScale: 1,
  textSize: 14,
  textLiteral: true,
  textX: 0,
  textY: 0,
  glassRenderer: "standard",
  glassOpacity: 1,
  glassBorder: 1,
  glassActive: false,
};
function propertyField(node, key, target = $("inspBody")) {
  const p = V.property(node, key),
    raw = p?.raw,
    id = node.id,
    path = idx().paths.get(id);
  let value = scene?.frames.get(id)?.p[key] ?? FALLBACK[key] ?? "",
    dynamic = false;
  try {
    value = scene?.runtime.get(path + "." + key, value) ?? value;
    dynamic = !!p && V.references(V.expressionOf(p)).length > 0;
  } catch {
    dynamic = true;
  }
  const wrap = element("div", "property-control"),
    apply = (newRaw) =>
      mutate("修改 " + (LABELS[key] || key), (next) =>
        V.setRaw(V.index(next.doc).byId.get(id), key, newRaw),
      );
  let control;
  const stageNumber = (v) => {
    if (v.trim() === "" || !Number.isFinite(Number(v))) return false;
    const raw = String(Number(v));
    if (V.property(idx().byId.get(id), key)?.raw === raw) return true;
    if (!pending) pending = V.clone(project);
    V.setRaw(idx().byId.get(id), key, raw);
    control.classList.remove("bound-value");
    wrap.querySelector(".binding-btn")?.classList.remove("bound");
    renderCanvas();
    renderLayers();
    return true;
  };
  if (ENUMS[key] || key === "action" || key === "holdAction") {
    control = selectControl(
      String(value),
      ENUMS[key] || ["", ...schema.actions],
      (v) => apply(V.literal(v)),
    );
  } else if (BOOLS.has(key))
    control = selectControl(String(value), ["true", "false"], (v) => apply(v));
  else if (key === "texture") {
    control = element("div", "color-control");
    const mode = selectControl(
      typeof value === "boolean" ? String(value) : "number",
      [
        { value: "false", label: "关闭" },
        { value: "true", label: "立体纹理" },
        { value: "number", label: "描边宽度" },
      ],
      (v) => apply(v === "number" ? "1" : v),
    );
    control.append(mode);
    if (typeof value === "number") {
      const width = textControl(
        value,
        (v) => {
          if (stageNumber(v)) flush();
        },
        "number",
      );
      width.min = 0;
      width.max = 64;
      width.step = ".1";
      width.addEventListener("input", () => stageNumber(width.value));
      control.append(width);
    }
  } else if (COLORS.has(key)) {
    control = element("div", "color-control");
    let hex = "#000000";
    try {
      hex = V.colorHex(value);
    } catch {}
    const picker = textControl(hex, () => {}, "color");
    picker.classList.add("color-swatch");
    picker.setAttribute("aria-label", (LABELS[key] || key) + "色盘");
    picker.addEventListener("input", () => {
      if (!pending) pending = V.clone(project);
      V.setRaw(idx().byId.get(id), key, V.colorRaw(picker.value));
      renderCanvas();
      hexInput.value = picker.value.toUpperCase();
    });
    picker.addEventListener("change", () => {
      flush();
      renderInspector();
    });
    const hexInput = textControl(hex.toUpperCase(), (v) => {
      try {
        apply(V.colorRaw(v));
      } catch (error) {
        toast(error.message);
        renderInspector();
      }
    });
    hexInput.classList.add("hex-input");
    hexInput.setAttribute("aria-label", (LABELS[key] || key) + " HEX");
    control.append(picker, hexInput);
  } else {
    const isText = STRINGS.has(key) || typeof value === "string";
    control = textControl(
      isText ? value : Number.isFinite(Number(value)) ? value : 0,
      (v) => {
        if (isText) apply(V.literal(v));
        else if (stageNumber(v)) flush();
        else {
          toast("请输入有限数值");
          renderInspector();
        }
      },
      isText ? "text" : "number",
    );
    if (!isText) {
      control.step = String(numberStep(key, value));
      control.addEventListener("input", () => stageNumber(control.value));
    }
    const bounds = schema.bounds[key];
    if (bounds) {
      control.min = bounds[0];
      control.max = bounds[1];
    }
  }
  control.dataset.prop = key;
  control.title =
    (raw ?? "使用默认值") +
    (control.type === "number"
      ? "；方向键或聚焦后滚轮微调，Shift ×10，Alt ÷10"
      : "");
  control.classList.toggle("bound-value", dynamic);
  const fx = button(
    "ƒ",
    () => expressionDialog(node, key),
    "binding-btn" + (dynamic ? " bound" : ""),
    "绑定变量或编辑表达式",
  );
  fx.dataset.bind = key;
  wrap.append(control, fx);
  field(LABELS[key] || key, wrap, key, target);
}
function renderInspector() {
  const body = $("inspBody");
  body.replaceChildren();
  $("propertiesTab").classList.toggle("active", inspectorTab === "properties");
  $("variablesTab").classList.toggle("active", inspectorTab === "variables");
  if (running) {
    section("交互预览");
    hint(
      "原生菜单、文件操作及宿主资源在 Pogget 内执行。这里预览布局、状态与控件值。",
    );
    renderVariables(true);
    return;
  }
  if (inspectorTab === "variables") {
    renderVariables();
    return;
  }
  const items = selected();
  if (!items.length) {
    const empty = element("div", "insp-empty");
    empty.append(
      element("div", "insp-empty-icon", "⬚"),
      element("p", "", "未选择组件"),
      element("span", "", "点击组件编辑属性，Shift 多选"),
    );
    body.append(empty);
    section("预设");
    const dependency = project.doc.roots.find((n) => n.name === "Preset");
    field(
      "基础预设",
      textControl(
        dependency
          ? V.evaluateExpression(
              V.expressionOf(V.property(dependency, "dependsOn")),
            )
          : "",
        (name) =>
          mutate(
            "修改基础预设",
            (next) => {
              next.doc.roots = next.doc.roots.filter(
                (n) => n.name !== "Preset",
              );
              if (name.trim())
                next.doc.roots.unshift(
                  V.makeBlock("Preset", { dependsOn: name.trim() }),
                );
            },
            { allowMissingBase: true },
          ),
      ),
    );
    body.append(
      button(
        "导入基础预设文件",
        () => {
          inputMode = "base";
          $("fileInput").click();
        },
        "btn-ghost full-width",
      ),
    );
    hint(
      "差异预设保留继承声明；基础预设开关用于查看继承图层。源码支持所有已接入的宿主 slot 与元数据。",
    );
    return;
  }
  const i = idx(),
    node = items[0],
    path = i.paths.get(node.id),
    p = scene?.frames.get(node.id)?.p || {
      type: scene?.runtime.get(path + ".type", "group"),
    };
  const head = element("div", "insp-el-head");
  head.append(
    element(
      "span",
      "insp-el-name",
      items.length > 1
        ? `已选择 ${items.length} 个组件`
        : path
            .split(".")
            .filter((s) => s !== "view")
            .join(" / "),
    ),
    element("span", "insp-el-type", p.type || ""),
  );
  body.append(head);
  if (items.length > 1) {
    body.append(
      button("编组 Ctrl+G", () => command("group"), "btn-ghost full-width"),
      button("复制 Ctrl+D", () => command("duplicate"), "btn-ghost full-width"),
    );
    hint("使用画布工具栏对齐或等距分布。拖动将保持相对位置。");
    body.append(button("删除所选组件", () => command("delete"), "btn-danger"));
    return;
  }
  const parent = i.parents.get(node.id),
    renameTarget = parent && !i.parents.get(parent.id) ? parent : node;
  field(
    "名称",
    textControl(renameTarget.name, (name) =>
      mutate("重命名图层", (next) => {
        if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name))
          throw new Error("名称需为字母、汉字、数字或下划线，且不能以数字开头");
        M.rename(next.doc, renameTarget.id, name);
      }),
    ),
  );
  if (p.type?.startsWith("pogget.native.")) {
    section("应用配置");
    for (const member of node.members.filter(
      (m) => m.kind === "property" && m.name !== "type",
    ))
      propertyField(node, member.name);
    body.append(
      button(
        "编辑组件与元数据源码",
        () => nodeSourceDialog(node),
        "btn-ghost full-width",
      ),
    );
    return;
  }
  section("布局");
  for (const key of [
    "type",
    "x",
    "y",
    "width",
    "height",
    "z",
    "opacity",
    "visible",
    "enabled",
  ])
    propertyField(node, key);
  field(
    "父分组",
    selectControl(
      parent && i.parents.get(parent.id) ? parent.id : "",
      [
        { value: "", label: "画板根层" },
        ...V.viewNodes(project.doc)
          .filter(
            (v) =>
              v.node.id !== node.id &&
              scene?.frames.get(v.node.id)?.p.type === "group" &&
              !M.ancestors(i, v.node.id).some((n) => n.id === node.id),
          )
          .map((v) => ({ value: v.node.id, label: i.paths.get(v.node.id) })),
      ],
      (value) =>
        mutate("移动到分组", (next) =>
          M.reparent(next.doc, [node.id], value || null, modelInputs()),
        ),
    ),
  );
  const type = p.type || "rect",
    shown = new Set([
      "type",
      "x",
      "y",
      "width",
      "height",
      "z",
      "opacity",
      "visible",
      "enabled",
      "toggle",
    ]);
  renderInteractionInspector(node, path, p);
  if (type === "content")
    hint(
      "嵌入由 Pogget 绘制的应用内容，例如 Markdown 预览或编辑区。source 指定内容来源，在线画布显示占位。",
    );
  for (const group of propertyGroups(node, p)) {
    let target = body;
    if (group.collapsed) {
      const details = element("details", "property-details");
      details.append(element("summary", "", group.title));
      target = element("div", "property-details-body");
      details.append(target);
      body.append(details);
    } else section(group.title);
    for (const key of group.keys) {
      propertyField(node, key, target);
      shown.add(key);
    }
    if (group.gradients) {
      gradientEditor(node, "backgroundGradient", "背景渐变", target);
      gradientEditor(node, "borderGradient", "描边渐变", target);
    }
  }
  if (type === "group")
    body.append(
      button(
        "选择所有直接子节点",
        () =>
          select(
            V.viewNodes(project.doc)
              .filter((v) => v.parent?.id === node.id)
              .map((v) => v.node.id),
          ),
        "btn-ghost full-width",
      ),
    );
  if (type === "path")
    hint(
      "拖动路径节点；双击路径区域添加点；双击节点删除。绑定点列时请在变量中修改。",
    );
  const hot = V.block(node, "hover");
  const details = element("details", "property-details");
  details.append(element("summary", "", "悬停状态"));
  if (hot) {
    for (const key of [
      ...new Set([
        "opacity",
        ...hot.members.filter((m) => m.kind === "property").map((m) => m.name),
      ]),
    ])
      propertyField(hot, key, details);
    details.append(
      button(
        "添加悬停属性",
        () => hoverPropertyDialog(node),
        "btn-ghost full-width",
      ),
      button(
        "编辑 hover 完整声明",
        () => nodeSourceDialog(hot),
        "btn-ghost full-width",
      ),
      button(
        "移除悬停状态",
        () =>
          mutate("移除悬停状态", (next) => {
            const target = V.index(next.doc).byId.get(node.id);
            target.members = target.members.filter((m) => m.name !== "hover");
          }),
        "btn-ghost full-width",
      ),
    );
  } else
    details.append(
      button(
        "添加悬停状态",
        () =>
          mutate("添加悬停状态", (next) =>
            V.index(next.doc)
              .byId.get(node.id)
              .members.push(V.makeBlock("hover", { opacity: 0.75 })),
          ),
        "btn-ghost full-width",
      ),
    );
  body.append(details);
  // Preserve explicit extensions without surfacing irrelevant defaults.
  const extra = node.members.filter(
    (m) => m.kind === "property" && !shown.has(m.name),
  );
  if (extra.length) {
    const extended = element("details", "property-details");
    extended.append(element("summary", "", "其他已声明属性 · " + extra.length));
    for (const m of extra) propertyField(node, m.name, extended);
    body.append(extended);
  }
  section("完整声明");
  body.append(
    button(
      "编辑组件与元数据源码",
      () => nodeSourceDialog(node),
      "btn-ghost full-width",
    ),
    button("添加属性", () => addPropertyDialog(node), "btn-ghost full-width"),
  );
  hint(
    "hover、ui、动画策略、布局策略、repeat 等嵌套声明会完整保留，可在源码中编辑。",
  );
  body.append(button("删除组件", () => command("delete"), "btn-danger"));
  if (isLocked(node.id)) {
    hint("此图层已锁定，解锁后可编辑。");
    body
      .querySelectorAll("input,select,button")
      .forEach((n) => (n.disabled = true));
    body.append(
      button(
        "解锁",
        () =>
          mutate("解锁图层", (next) => {
            const chain = M.ancestors(i, node.id).map((n) => n.id);
            next.locks = next.locks.filter(
              (id) => id !== node.id && !chain.includes(id),
            );
          }),
        "btn-ghost full-width",
      ),
    );
  }
}
function renderInteractionInspector(node, path, values) {
  section("交互");
  const doc = effective(),
    states = I.booleanStates(doc),
    target = values.toggle
      ? V.resolveReference(values.toggle, path + ".toggle")
      : "";
  const toggle = selectControl(
    target,
    [
      { value: "", label: "不切换状态" },
      ...states.map((value) => ({ value, label: value })),
    ],
    (value) =>
      mutate("修改点击切换", (next) =>
        I.setClickToggle(next, standard, node.id, value),
      ),
  );
  toggle.setAttribute("aria-label", "点击切换变量");
  field("点击切换", toggle);
  if (target && states.includes(target)) {
    const initial = new V.Runtime(doc).get(target);
    const control = selectControl(
      String(initial),
      [
        { value: "false", label: "关闭（false）" },
        { value: "true", label: "开启（true）" },
      ],
      (value) =>
        mutate("修改开关默认值", (next) =>
          I.setBooleanDefault(next, standard, target, value === "true"),
        ),
    );
    control.setAttribute("aria-label", "开关默认值");
    field("默认状态", control);
  }
  $("inspBody").append(
    button(
      "新建开关变量",
      () => booleanStateDialog(node, path),
      "btn-ghost full-width",
    ),
  );
  hint("点击后保持开关状态；可在其他组件的交互绑定中使用此变量。");
  const effectiveNode = V.index(doc).byPath.get(path);
  for (const def of I.INTERACTION_PROPERTIES) {
    const binding = I.interactionBinding(doc, effectiveNode, def.key);
    if (!binding) continue;
    const row = element("div", "interaction-binding");
    row.dataset.interactionProperty = def.key;
    const label = element("span", "", `${def.label} ← ${binding.source}`);
    label.title = label.textContent;
    row.append(
      label,
      button("编辑", () => interactionBindingDialog(node, binding), "mini-btn"),
      button(
        "解除",
        () =>
          mutate("解除交互绑定", (next) => {
            const runtime = new V.Runtime(
              M.effectiveProject(next, standard),
              inputValues(),
            );
            V.setValue(
              V.index(next.doc).byId.get(node.id),
              def.key,
              runtime.get(path + "." + def.key),
            );
          }),
        "mini-btn",
      ),
    );
    $("inspBody").append(row);
  }
  $("inspBody").append(
    button(
      "添加交互绑定",
      () => interactionBindingDialog(node),
      "btn-ghost full-width",
    ),
  );
  hint("选择开关变量或悬停来源，设置属性在两种状态下的值。");
}
function booleanStateDialog(node, path) {
  let name, initial;
  const component = path.split(".")[0],
    existing = V.index(effective()).byPath;
  let suggested = "expanded",
    suffix = 1;
  while (existing.has(`${component}.state.${suggested}`))
    suggested = "expanded" + ++suffix;
  dialog(
    "新建开关变量",
    (body) => {
      body.append(
        element(
          "p",
          "panel-hint",
          `在 ${component} 中创建开关，并绑定当前组件的点击。`,
        ),
      );
      name = textControl(suggested, () => {});
      name.setAttribute("aria-label", "开关变量名");
      initial = selectControl(
        "false",
        [
          { value: "false", label: "关闭（false）" },
          { value: "true", label: "开启（true）" },
        ],
        () => {},
      );
      initial.setAttribute("aria-label", "开关初始值");
      field("变量名称", name, "", body);
      field("默认状态", initial, "", body);
    },
    [
      {
        label: "创建并绑定点击",
        primary: true,
        run: () => {
          if (
            !mutate("创建点击开关", (next) => {
              const state = I.createBooleanState(
                next,
                standard,
                component,
                name.value.trim(),
                initial.value === "true",
              );
              I.setClickToggle(next, standard, node.id, state);
            })
          )
            throw new Error(lastError || "创建开关失败");
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function interactionValueControl(raw, def, label) {
  let expr;
  try {
    expr = V.parseExpression(raw);
    if (!V.references(expr).length)
      expr = { value: V.evaluateExpression(expr) };
  } catch {}
  let control, read;
  if (expr && "value" in expr) {
    if (def.kind === "boolean") {
      control = selectControl(
        String(expr.value),
        [
          { value: "false", label: "否（false）" },
          { value: "true", label: "是（true）" },
        ],
        () => {},
      );
      read = () => control.value;
    } else if (def.kind === "color") {
      control = textControl(V.colorHex(expr.value), () => {}, "color");
      read = () => V.colorRaw(control.value);
    } else {
      control = textControl(
        expr.value,
        () => {},
        def.kind === "number" ? "number" : "text",
      );
      if (def.kind === "number") {
        const bounds = schema.bounds[def.key];
        if (bounds) [control.min, control.max] = bounds.map(String);
      }
      read = () => {
        return def.kind === "number"
          ? control.value.trim()
          : V.literal(control.value);
      };
    }
  } else {
    control = textControl(raw, () => {});
    control.title = "Vina 表达式";
    read = () => control.value.trim();
  }
  control.setAttribute("aria-label", label);
  return { control, read };
}
function interactionBindingDialog(node, initial = null) {
  const doc = effective(),
    index = V.index(doc),
    states = I.booleanStates(doc),
    views = V.viewNodes(doc).map(({ node }) => index.paths.get(node.id));
  let config = initial
    ? { ...initial }
    : {
        key: "visible",
        kind: "state",
        source: states[0] || "",
        off: "false",
        on: "true",
      };
  let off, on;
  const build = (body) => {
    body.replaceChildren();
    const def = I.INTERACTION_PROPERTIES.find(
      (item) => item.key === config.key,
    );
    const property = selectControl(
      config.key,
      I.INTERACTION_PROPERTIES.map((item) => ({
        value: item.key,
        label: item.label,
      })),
      (key) => {
        const info = I.interactionBinding(
            doc,
            index.byPath.get(idx().paths.get(node.id)),
            key,
          ),
          next = I.INTERACTION_PROPERTIES.find((item) => item.key === key);
        config = info || {
          ...config,
          key,
          off: V.literal(next.off),
          on: V.literal(next.on),
        };
        build(body);
      },
    );
    property.disabled = !!initial;
    property.setAttribute("aria-label", "交互目标属性");
    field("目标属性", property, "", body);
    const kind = selectControl(
      config.kind,
      [
        { value: "state", label: "点击开关状态" },
        { value: "hover", label: "悬停状态" },
      ],
      (value) => {
        config.off = off.read();
        config.on = on.read();
        config.kind = value;
        config.source =
          value === "state"
            ? states[0] || ""
            : (views.find((path) => path !== idx().paths.get(node.id)) ||
                views[0]) + ".hovered";
        build(body);
      },
    );
    kind.setAttribute("aria-label", "交互驱动类型");
    field("驱动方式", kind, "", body);
    const options =
      config.kind === "state" ? states : views.map((path) => path + ".hovered");
    const source = selectControl(
      config.source,
      options.map((value) => ({
        value,
        label: value.replace(/\.hovered$/, ""),
      })),
      (value) => {
        config.source = value;
      },
    );
    source.setAttribute("aria-label", "交互来源");
    field(config.kind === "state" ? "开关变量" : "悬停组件", source, "", body);
    body.append(
      element(
        "p",
        "panel-hint",
        config.kind === "state"
          ? states.length
            ? "开关可由按钮点击切换，也可被多个组件共享。"
            : "请先选择触发按钮，在属性面板中点击“新建开关变量”。"
          : "指针进入来源组件时启用，移出时恢复。点击开关状态不受悬停影响。",
      ),
    );
    off = interactionValueControl(config.off, def, "交互关闭值");
    on = interactionValueControl(config.on, def, "交互开启值");
    field(
      config.kind === "state" ? "关闭时" : "未悬停时",
      off.control,
      "",
      body,
    );
    field(config.kind === "state" ? "开启时" : "悬停时", on.control, "", body);
  };
  dialog(initial ? "编辑交互绑定" : "添加交互绑定", build, [
    {
      label: "应用交互绑定",
      primary: true,
      run: () => {
        const nextConfig = { ...config, off: off.read(), on: on.read() };
        if (
          !mutate("绑定交互属性", (next) =>
            I.bindInteraction(
              next,
              standard,
              node.id,
              nextConfig,
              inputValues(),
              schema,
            ),
          )
        )
          throw new Error(lastError || "交互绑定未通过校验");
        closeDialog($("editDialog"));
      },
    },
  ]);
}
function hoverPropertyDialog(node) {
  let key, value;
  dialog(
    "添加悬停属性",
    (body) => {
      const options = I.INTERACTION_PROPERTIES.filter((item) =>
        ["number", "color"].includes(item.kind),
      );
      const valueBox = element("div");
      const update = () => {
        valueBox.replaceChildren();
        const def = options.find((item) => item.key === key.value);
        value = interactionValueControl(V.literal(def.on), def, "悬停属性值");
        field("悬停时", value.control, "", valueBox);
      };
      key = selectControl(
        "opacity",
        options.map((item) => ({ value: item.key, label: item.label })),
        update,
      );
      key.setAttribute("aria-label", "悬停属性");
      field("属性", key, "", body);
      body.append(valueBox);
      update();
    },
    [
      {
        label: "应用悬停属性",
        primary: true,
        run: () => {
          const raw = value.read();
          V.parseExpression(raw);
          if (
            !mutate("修改悬停属性", (next) => {
              const target = V.index(next.doc).byId.get(node.id);
              let hot = V.block(target, "hover");
              if (!hot) target.members.push((hot = V.makeBlock("hover")));
              V.setRaw(hot, key.value, raw);
            })
          )
            throw new Error(lastError || "悬停属性无效");
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function gradientEditor(node, key, title, target = $("inspBody")) {
  const gradient = V.block(node, key),
    row = element("div", "gradient-row");
  row.append(element("span", "", title));
  row.append(
    button(
      gradient ? "编辑" : "添加",
      () => gradientDialog(node, key),
      "mini-btn",
    ),
  );
  if (gradient)
    row.append(
      button(
        "移除",
        () =>
          mutate("移除" + title, (next) => {
            const n = V.index(next.doc).byId.get(node.id);
            n.members = n.members.filter((m) => m.name !== key);
          }),
        "mini-btn",
      ),
    );
  target.append(row);
}
function renderVariables(preview = false) {
  if (!preview) {
    $("inspBody").append(
      button("新增变量 / 个性化控件", variableDialog, "btn-primary full-width"),
    );
    hint(
      "变量与 ui 控件保留原始类型；属性右侧 ƒ 可选择绑定。颜色使用 COLORREF / rgb()，时长使用秒或 ms。",
    );
  }
  const search = textControl(variableSearch, () => {});
  search.placeholder = "搜索变量或控件";
  search.setAttribute("aria-label", "搜索变量或控件");
  $("inspBody").append(search);
  const cards = [];
  const ownHeading = element("div", "insp-section", "本预设变量与控件"),
    ownList = element("div", "preset-variables"),
    inherited = element("details", "dependency-variables"),
    summary = element("summary", "", "依赖预设"),
    inheritedList = element("div", "dependency-variable-list"),
    empty = element("p", "panel-hint", "没有匹配的变量或控件");
  inherited.open = dependenciesExpanded;
  inherited.append(summary, inheritedList);
  inherited.addEventListener("toggle", () => {
    if (!search.value.trim()) dependenciesExpanded = inherited.open;
  });
  $("inspBody").append(ownHeading, ownList, inherited, empty);
  let doc;
  try {
    doc = effective();
  } catch {
    doc = project.doc;
  }
  const rt = new V.Runtime(doc, inputValues()),
    i = V.index(project.doc);
  let count = 0;
  for (const root of doc.roots)
    for (const scope of ["vars", "state", "ui"]) {
      const group = V.block(root, scope);
      if (!group) continue;
      const fields =
        scope === "ui"
          ? group.members
              .filter((n) => n.kind === "block")
              .map((n) => ({
                owner: n,
                p: V.property(n, "default"),
                key: n.name,
              }))
          : group.members
              .filter((n) => n.kind === "property")
              .map((p) => ({ owner: group, p, key: p.name }));
      for (const { owner, p, key } of fields) {
        const ownerPath = root.name + "." + scope + "." + key,
          kind =
            scope === "ui"
              ? rt.get(
                  ownerPath + ".control",
                  rt.get(ownerPath + ".type", "number"),
                )
              : "";
        if (!p && kind !== "button") continue;
        count++;
        const path = ownerPath + (scope === "ui" ? ".value" : "");
        const row = element("div", "variable-card"),
          label = element("div", "variable-title", path);
        row.append(label);
        let value;
        try {
          value = rt.get(path);
        } catch {
          value = "不可用";
        }
        const editable = p ? i.byId.has(p.id) : i.byId.has(owner.id);
        const own = editable || (scope === "ui" && i.byId.has(owner.id));
        let control;
        function change(v, commit = true) {
          if (preview) {
            const prior = runtimeOverrides[path];
            runtimeOverrides[path] = v;
            try {
              M.validate(project, standard, inputValues(), schema);
              renderCanvas();
            } catch (error) {
              if (prior === undefined) delete runtimeOverrides[path];
              else runtimeOverrides[path] = prior;
              toast(error.message);
            }
          } else if (editable) {
            if (typeof v === "number" && Number.isFinite(v)) {
              const target = idx().byId.get(owner.id);
              if (V.property(target, p.name)?.raw !== V.literal(v)) {
                if (!pending) pending = V.clone(project);
                V.setValue(target, p.name, v);
                renderCanvas();
                renderLayers();
              }
              if (commit) flush();
            } else
              mutate("修改变量", (next) => {
                V.setValue(V.index(next.doc).byId.get(owner.id), p.name, v);
              });
          }
        }
        if (kind === "button")
          control = button(
            rt.get(ownerPath + ".label", key),
            () =>
              toast(
                "在 Pogget 内执行：" +
                  rt.get(ownerPath + ".action", "按钮动作"),
              ),
            "btn-ghost full-width",
          );
        else if (
          preview &&
          scope === "ui" &&
          ["select", "choice"].includes(kind)
        ) {
          const choices =
              V.block(owner, "choices") || V.block(owner, "options"),
            entries =
              choices?.members.map((n, j) => ({
                value: String(j),
                label:
                  n.kind === "property"
                    ? String(
                        rt.get(ownerPath + "." + choices.name + "." + n.name),
                      )
                    : n.name,
              })) || [];
          control = selectControl(String(Number(value)), entries, (v) =>
            change(typeof value === "boolean" ? Number(v) !== 0 : Number(v)),
          );
        } else if (preview && scope === "ui" && kind === "color") {
          control = textControl(
            V.colorHex(value),
            (v) =>
              change(V.evaluateExpression(V.parseExpression(V.colorRaw(v)))),
            "color",
          );
        } else
          control =
            typeof value === "boolean"
              ? selectControl(String(value), ["true", "false"], (v) =>
                  change(v === "true"),
                )
              : textControl(
                  value,
                  (v) => change(typeof value === "number" ? Number(v) : v),
                  typeof value === "number" ? "number" : "text",
                );
        if (preview && kind === "slider") {
          control.type = "range";
          control.min = rt.get(ownerPath + ".min", 0);
          control.max = rt.get(ownerPath + ".max", 1);
          control.step = rt.get(ownerPath + ".step", 0.01);
          control.addEventListener("input", () =>
            change(Number(control.value)),
          );
        }
        if (control.type === "number") {
          control.step = String(
            scope === "ui"
              ? rt.get(ownerPath + ".step", numberStep(key, value))
              : numberStep(key, value),
          );
          if (scope === "ui") {
            control.min = rt.get(ownerPath + ".min", "");
            control.max = rt.get(ownerPath + ".max", "");
          }
          control.addEventListener("input", () => {
            if (control.value.trim() && Number.isFinite(Number(control.value)))
              change(Number(control.value), false);
          });
        }
        control.setAttribute("aria-label", path);
        control.disabled = !preview && !editable;
        row.append(control);
        if (!preview && editable && p)
          row.append(
            button("表达式", () => expressionDialog(owner, p.name), "mini-btn"),
          );
        if (!preview && scope === "ui" && i.byId.has(owner.id))
          row.append(
            button("控件设置", () => nodeSourceDialog(owner), "mini-btn"),
          );
        if (!editable) {
          row.append(element("span", "subtle", "继承自基础预设"));
          if (!preview && p)
            row.append(
              button(
                "创建覆盖",
                () =>
                  mutate("覆盖基础变量", (next) => {
                    let target = next.doc.roots.find(
                      (n) => n.name === root.name,
                    );
                    if (!target) {
                      target = V.makeBlock(root.name);
                      next.doc.roots.push(target);
                    }
                    for (const name of [
                      scope,
                      ...(scope === "ui" ? [key] : []),
                    ]) {
                      let child = V.block(target, name);
                      if (!child) {
                        child = V.makeBlock(name);
                        target.members.push(child);
                      }
                      target = child;
                    }
                    V.setValue(target, p.name, value);
                  }),
                "mini-btn",
              ),
            );
        }
        row.dataset.variable = path;
        const labelText =
          scope === "ui" ? rt.get(ownerPath + ".label", key) : key;
        cards.push({
          row,
          text: [path, labelText, value]
            .join(" ")
            .normalize("NFKC")
            .toLowerCase(),
          own,
        });
        (own ? ownList : inheritedList).append(row);
      }
    }
  const filter = () => {
    variableSearch = search.value;
    const terms = variableSearch
      .normalize("NFKC")
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let ownCount = 0,
      inheritedCount = 0;
    for (const card of cards) {
      card.row.hidden = !terms.every((term) => card.text.includes(term));
      if (!card.row.hidden) {
        if (card.own) ownCount++;
        else inheritedCount++;
      }
    }
    ownHeading.hidden = ownCount === 0;
    ownList.hidden = ownCount === 0;
    inherited.hidden = inheritedCount === 0;
    summary.textContent = "依赖预设 · " + inheritedCount + " 项";
    inherited.open = terms.length ? inheritedCount > 0 : dependenciesExpanded;
    empty.hidden = ownCount + inheritedCount > 0 || !count;
  };
  search.addEventListener("input", filter);
  filter();
  if (!count)
    hint(
      "尚无变量。新增 vars 常量、state 状态或 ui 控件后，可在任意属性中引用。",
    );
}
function dialog(title, build, actions = []) {
  flush();
  $("dialogTitle").textContent = title;
  $("dialogBody").replaceChildren();
  $("dialogFoot").replaceChildren();
  $("dialogError").textContent = "";
  $("editDialog").classList.remove("wide-dialog");
  build($("dialogBody"));
  $("dialogFoot").append(
    button("关闭", () => closeDialog($("editDialog")), "btn-ghost"),
  );
  for (const { label, run, primary } of actions)
    $("dialogFoot").append(
      button(
        label,
        async () => {
          try {
            await run();
          } catch (error) {
            $("dialogError").textContent = error.message;
          }
        },
        primary ? "btn-primary" : "btn-ghost",
      ),
    );
  if (!$("editDialog").open) showDialog($("editDialog"));
}
function newProjectDialog() {
  if (running || busy || !flush()) return;
  let name, width, height;
  dialog(
    "新建工程",
    (body) => {
      body.append(
        element(
          "p",
          "panel-hint",
          "创建空白画板。当前工程会保留在撤销记录中，可用 Ctrl+Z 恢复。",
        ),
      );
      name = textControl("未命名", () => {});
      name.maxLength = 80;
      name.setAttribute("aria-label", "工程名称");
      width = textControl(360, () => {}, "number");
      height = textControl(480, () => {}, "number");
      for (const [label, control] of [
        ["画板宽度", width],
        ["画板高度", height],
      ]) {
        control.min = "120";
        control.max = "32768";
        control.setAttribute("aria-label", label);
      }
      field("名称", name, "", body);
      field("宽度", width, "", body);
      field("高度", height, "", body);
    },
    [
      {
        label: "创建工程",
        primary: true,
        run: () => {
          if (!name.value.trim()) throw new Error("请输入工程名称");
          if (
            !mutate("新建工程", (next) => {
              for (const key of Object.keys(next)) delete next[key];
              Object.assign(next, {
                version: 2,
                name: name.value.trim(),
                board: { w: Number(width.value), h: Number(height.value) },
                doc: { roots: [] },
                locks: [],
              });
              selection = [];
            })
          )
            throw new Error(lastError || "新建失败");
          ++importRevision;
          lastSelection = [];
          runtimeOverrides = {};
          hostOverrides = {};
          hoverStates.clear();
          collapsed.clear();
          inspectorTab = "properties";
          variableSearch = "";
          dependenciesExpanded = false;
          $("layerSearch").value = "";
          closeContext();
          renderAll();
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function previewSettingsDialog() {
  let title, measured, mode, frame, upward;
  dialog(
    "Pogget 预览设置",
    (body) => {
      const inputs = inputValues(),
        grid = element("div", "dialog-grid");
      const add = (name, control) => {
        control.setAttribute("aria-label", name);
        grid.append(element("label", "", name), control);
        return control;
      };
      measured = textControl(
        inputs["pogget.titleTextWidth"],
        () => {},
        "number",
      );
      title = add(
        "标题文字",
        textControl(inputs["pogget.tag.text"], (value) => {
          const context = document.createElement("canvas").getContext("2d");
          context.font = '14px "Segoe UI"';
          measured.value = Math.ceil(context.measureText(value).width);
        }),
      );
      add("标题测量宽度", measured);
      mode = add(
        "窗口渲染模式",
        selectControl(
          String(inputs["pogget.mode"]),
          [
            { value: "0", label: "默认" },
            { value: "1", label: "静态" },
            { value: "2", label: "模糊" },
            { value: "3", label: "透明" },
            { value: "4", label: "扩展" },
          ],
          () => {},
        ),
      );
      frame = add(
        "窗口边框",
        selectControl(
          String(inputs["pogget.containerFrame.frame"]),
          [
            { value: "0", label: "无" },
            { value: "1", label: "画布边框" },
            { value: "2", label: "系统边框" },
            { value: "3", label: "高光边框" },
          ],
          () => {},
        ),
      );
      upward = add(
        "向上展开",
        selectControl(
          String(inputs["pogget.upward"]),
          [
            { value: "false", label: "否" },
            { value: "true", label: "是" },
          ],
          () => {},
        ),
      );
      body.append(
        grid,
        element(
          "p",
          "panel-hint",
          "窗口状态、标题与鼠标位置会影响预设布局。这里仅改变预览，不写入预设，也不产生撤销记录。运行时在画布上移动鼠标可预览视差。",
        ),
      );
    },
    [
      {
        label: "恢复默认",
        run: () => {
          hostOverrides = {};
          renderAll();
          closeDialog($("editDialog"));
        },
      },
      {
        label: "应用预览",
        primary: true,
        run: () => {
          const width = Number(measured.value);
          if (!Number.isFinite(width) || width < 0 || width > 32768)
            throw new Error("标题测量宽度必须在 0..32768 之间");
          const next = {
            ...hostOverrides,
            "pogget.title": title.value,
            "pogget.tag.text": title.value,
            "pogget.tag.oldText": title.value,
            "pogget.titleTextWidth": width,
            "pogget.tag.measuredWidth": width,
            "pogget.mode": Number(mode.value),
            "pogget.containerFrame.mode": Number(mode.value),
            "pogget.frame": Number(frame.value),
            "pogget.containerFrame.frame": Number(frame.value),
            "pogget.upward": upward.value === "true",
            "pogget.containerFrame.upward": upward.value === "true",
          };
          M.validate(project, standard, { ...inputValues(), ...next }, schema);
          hostOverrides = next;
          renderAll();
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function textarea(value) {
  const n = element("textarea", "source-editor");
  n.spellcheck = false;
  n.value = value;
  n.setAttribute("aria-label", "Vina 源码");
  n.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = n.selectionStart;
      n.setRangeText("  ", start, n.selectionEnd, "end");
    }
  });
  return n;
}
function sourceDialog() {
  let input;
  dialog(
    "Vina 源码",
    (body) => {
      body.append(
        element(
          "p",
          "panel-hint",
          "应用前完整校验。未通过时保留当前工程；成功应用可一次撤销。",
        ),
      );
      input = textarea(M.projectSource(project));
      body.append(input);
      $("editDialog").classList.add("wide-dialog");
    },
    [
      {
        label: "应用源码",
        primary: true,
        run: () => {
          const next = M.projectFromVina(input.value, project);
          if (
            !mutate("应用源码", (target) => Object.assign(target, next), {
              allowMissingBase: true,
            })
          )
            throw new Error(lastError || "源码校验未通过，请修正后再应用");
          selection = [];
          renderAll();
          closeDialog($("editDialog"));
        },
      },
      {
        label: "恢复上次有效版本",
        run: () => {
          const raw = localStorage.getItem(RECOVERY);
          if (!raw) throw new Error("尚无恢复备份");
          const next = M.projectFromJSON(raw);
          if (
            mutate("恢复备份", (target) => Object.assign(target, next), {
              allowMissingBase: true,
            })
          ) {
            closeDialog($("editDialog"));
            selection = [];
            renderAll();
          } else throw new Error(lastError);
        },
      },
    ],
  );
}
function nodeSourceDialog(node) {
  let input;
  dialog(
    "编辑 " + node.name + " 的完整声明",
    (body) => {
      input = textarea(V.serialize({ roots: [node] }));
      body.append(input);
    },
    [
      {
        label: "应用",
        primary: true,
        run: () => {
          const parsed = V.parse(input.value);
          if (parsed.roots.length !== 1 || parsed.roots[0].name !== node.name)
            throw new Error("请保留当前块名称，只编辑块内声明");
          if (
            !mutate("编辑完整声明", (next) => {
              const i = V.index(next.doc),
                old = i.byId.get(node.id),
                parent = i.parents.get(node.id),
                list = parent?.members || next.doc.roots;
              parsed.roots[0].id = node.id;
              list.splice(list.indexOf(old), 1, parsed.roots[0]);
            })
          )
            throw new Error("声明未通过校验");
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function expressionDialog(node, key) {
  let input, search, list, display;
  const path = idx().paths.get(node.id) + "." + key;
  dialog(
    "表达式 · " + key,
    (body) => {
      input = textarea(
        V.property(node, key)?.raw ?? V.literal(FALLBACK[key] ?? ""),
      );
      input.classList.add("expression-editor");
      input.setAttribute("aria-label", "属性表达式");
      body.append(
        element(
          "p",
          "panel-hint",
          "引用用 ${变量路径}；支持 rgb、fade、min/max、clamp、f32 和条件表达式。",
        ),
        input,
      );
      display = element("p", "expression-result");
      body.append(display);
      const update = () => {
        try {
          const rt = new V.Runtime(effective(), inputValues());
          const value = V.evaluateExpression(
            V.parseExpression(input.value),
            (ref) => rt.get(V.resolveReference(ref, path)),
          );
          display.textContent = "当前预览值：" + String(value);
          display.classList.remove("error");
        } catch (error) {
          display.textContent = error.message;
          display.classList.add("error");
        }
      };
      input.addEventListener("input", update);
      update();
      search = textControl("", () => {});
      search.placeholder = "搜索主题、布局、ui 或 state 变量";
      search.setAttribute("aria-label", "搜索变量");
      body.append(search);
      list = element("div", "reference-list");
      body.append(list);
      const rt = new V.Runtime(effective(), inputValues());
      const names = [
        ...new Set([
          ...Object.keys(defaults),
          ...schema.references,
          ...[...rt.idx.byPath]
            .filter(([, p]) => p.kind === "property")
            .map(([path]) => path),
          ...rt.aliases.keys(),
        ]),
      ];
      const refresh = () => {
        list.replaceChildren();
        const query = search.value.toLowerCase();
        for (const name of names
          .filter((n) => n.toLowerCase().includes(query))
          .slice(0, 120)) {
          let value;
          try {
            value = rt.get(name);
          } catch {
            continue;
          }
          const option = button(
            name + "  ·  " + String(value).slice(0, 40),
            () => {
              input.setRangeText(
                "${" + name + "}",
                input.selectionStart,
                input.selectionEnd,
                "end",
              );
              input.focus();
              update();
            },
            "reference-option",
          );
          list.append(option);
        }
      };
      search.addEventListener("input", refresh);
      refresh();
    },
    [
      {
        label: "使用当前值（解除绑定）",
        run: () => {
          const rt = new V.Runtime(effective(), inputValues());
          input.value = V.literal(
            V.evaluateExpression(V.parseExpression(input.value), (ref) =>
              rt.get(V.resolveReference(ref, path)),
            ),
          );
        },
      },
      {
        label: "应用表达式",
        primary: true,
        run: () => {
          V.parseExpression(input.value);
          if (
            !mutate("绑定表达式", (next) =>
              V.setRaw(V.index(next.doc).byId.get(node.id), key, input.value),
            )
          )
            throw new Error(lastError || "表达式未通过校验");
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function addPropertyDialog(node) {
  let key, input;
  dialog(
    "添加 Vina 属性",
    (body) => {
      key = textControl("", () => {});
      key.placeholder = "属性名，例如 textShadowOpacity";
      input = textControl("0", () => {});
      body.append(key, input);
    },
    [
      {
        label: "添加",
        primary: true,
        run: () => {
          if (!/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(key.value))
            throw new Error("属性名称无效");
          if (
            !mutate("添加属性", (next) =>
              V.setRaw(
                V.index(next.doc).byId.get(node.id),
                key.value,
                input.value,
              ),
            )
          )
            throw new Error("属性未通过校验");
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function gradientDialog(node, key) {
  const existing = V.block(node, key);
  let draft = existing
    ? V.clone(existing)
    : V.makeBlock(key, { type: "linear" }, [
        V.makeBlock("stops", {}, [
          V.makeBlock("Start", { position: 0, color: 0xfb7952 }),
          V.makeBlock("End", { position: 1, color: 0xff9ada }),
        ]),
      ]);
  let kind, enabled, geometry, stopsContainer;
  const read = (n, k, d) => {
    try {
      return V.evaluateExpression(V.expressionOf(V.property(n, k)));
    } catch {
      return d;
    }
  };
  dialog(
    key === "backgroundGradient" ? "背景渐变" : "描边渐变",
    (body) => {
      const top = element("div", "dialog-grid");
      kind = selectControl(
        read(draft, "type", "linear"),
        ["linear", "radial"],
        (v) => {
          V.setValue(draft, "type", v);
          refreshGeometry();
        },
      );
      enabled = selectControl(
        String(read(draft, "enabled", true)),
        ["true", "false"],
        (v) => V.setValue(draft, "enabled", v === "true"),
      );
      top.append(
        element("label", "", "类型"),
        kind,
        element("label", "", "启用"),
        enabled,
      );
      body.append(top);
      geometry = element("div", "dialog-grid");
      body.append(geometry);
      stopsContainer = element("div", "gradient-stops");
      body.append(stopsContainer);
      body.append(
        button(
          "添加色标",
          () => {
            const stops = V.block(draft, "stops");
            if (stops.members.length >= 16) {
              toast("最多 16 个色标");
              return;
            }
            let name = "Stop" + stops.members.length;
            while (stops.members.some((n) => n.name === name)) name += "1";
            stops.members.push(
              V.makeBlock(name, { position: 1, color: 0xffffff }),
            );
            refreshStops();
          },
          "btn-ghost full-width",
        ),
      );
      body.append(
        element(
          "p",
          "panel-hint",
          "色标按声明顺序排列，位置需从小到大；同位置可形成硬边。颜色表达式支持 rgb() 和 ${pogget.theme.*}。",
        ),
      );
      function refreshGeometry() {
        geometry.replaceChildren();
        const keys =
          kind.value === "radial"
            ? { centerX: 0.5, centerY: 0.5, radiusX: 0.5, radiusY: 0.5 }
            : { startX: 0, startY: 0, endX: 1, endY: 0 };
        for (const [k, d] of Object.entries(keys)) {
          const input = textControl(
            V.property(draft, k)?.raw ?? String(d),
            (v) => V.setRaw(draft, k, v),
          );
          input.setAttribute("aria-label", k);
          geometry.append(element("label", "", k), input);
        }
      }
      function refreshStops() {
        stopsContainer.replaceChildren();
        const stops = V.block(draft, "stops");
        for (const stop of stops.members) {
          const row = element("div", "gradient-stop"),
            name = element("span", "subtle", stop.name);
          row.append(name);
          const pos = textControl(
            V.property(stop, "position")?.raw ?? "0",
            (v) => V.setRaw(stop, "position", v),
          );
          pos.title = "位置 0..1";
          pos.setAttribute("aria-label", stop.name + " 位置");
          row.append(pos);
          let c = "#000000";
          try {
            const owner = scene?.runtime.idx.paths.get(existing?.id);
            c = V.colorHex(
              owner
                ? scene.runtime.get(owner + ".stops." + stop.name + ".color")
                : read(stop, "color", 0),
            );
          } catch {}
          const picker = textControl(
            c,
            (v) => {
              V.setRaw(stop, "color", V.colorRaw(v));
              raw.value = V.property(stop, "color").raw;
            },
            "color",
          );
          picker.classList.add("stop-color");
          picker.setAttribute("aria-label", stop.name + " 色盘");
          row.append(picker);
          const raw = textControl(V.property(stop, "color")?.raw ?? "0", (v) =>
            V.setRaw(stop, "color", v),
          );
          raw.title = "COLORREF / rgb() / ${变量}";
          raw.setAttribute("aria-label", stop.name + " 颜色表达式");
          row.append(raw);
          const alpha = textControl(
            V.property(stop, "opacity")?.raw ?? "1",
            (v) => V.setRaw(stop, "opacity", v),
          );
          alpha.title = "透明度 0..1";
          alpha.setAttribute("aria-label", stop.name + " 透明度");
          row.append(alpha);
          row.append(
            button(
              "−",
              () => {
                if (stops.members.length <= 2) {
                  toast("至少保留两个色标");
                  return;
                }
                stops.members = stops.members.filter((n) => n !== stop);
                refreshStops();
              },
              "mini-btn",
              "删除色标",
            ),
          );
          stopsContainer.append(row);
        }
      }
      refreshGeometry();
      refreshStops();
    },
    [
      {
        label: "应用渐变",
        primary: true,
        run: () => {
          if (
            !mutate("编辑渐变", (next) => {
              const n = V.index(next.doc).byId.get(node.id);
              n.members = n.members.filter((m) => m.name !== key);
              n.members.push(draft);
            })
          )
            throw new Error(lastError || "渐变未通过校验，请检查位置和表达式");
          closeDialog($("editDialog"));
        },
      },
    ],
  );
}
function variableDialog() {
  let component, scope, name, type, control, value, min, max, step, options;
  dialog(
    "新增变量或个性化控件",
    (body) => {
      const grid = element("div", "dialog-grid"),
        roots = project.doc.roots.filter((n) => n.name !== "Preset");
      const add = (label, n) => grid.append(element("label", "", label), n);
      component = selectControl(
        roots[0]?.name || "Variables",
        roots.length ? roots.map((n) => n.name) : ["Variables"],
        () => {},
      );
      add("所属组件", component);
      scope = selectControl(
        "vars",
        [
          { value: "vars", label: "vars · 表达式变量" },
          { value: "state", label: "state · 运行时状态" },
          { value: "ui", label: "ui · 个性化控件" },
        ],
        () => {},
      );
      add("作用域", scope);
      name = textControl("Value1", () => {});
      add("变量名", name);
      type = selectControl(
        "number",
        ["number", "boolean", "text", "color"],
        () => {},
      );
      add("值类型", type);
      control = selectControl(
        "slider",
        [
          "slider",
          "number",
          "switch",
          "choice",
          "select",
          "text",
          "color",
          "font",
          "button",
        ],
        () => {},
      );
      add("ui 控件", control);
      value = textControl("12", () => {});
      value.setAttribute("aria-label", "变量默认值");
      add("默认值 / 表达式", value);
      min = textControl("0", () => {});
      max = textControl("100", () => {});
      step = textControl("1", () => {});
      add("最小值", min);
      add("最大值", max);
      add("步长", step);
      options = textarea("选项一\n选项二");
      options.classList.add("options-editor");
      add("choice/select 选项", options);
      body.append(
        grid,
        element(
          "p",
          "panel-hint",
          "文本默认值直接输入文字。状态变量只能使用字面量。ui 的 choice/select 默认值是从 0 开始的选项序号。",
        ),
      );
    },
    [
      {
        label: "创建",
        primary: true,
        run: () => {
          if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name.value))
            throw new Error("变量名无效");
          if (
            !mutate("创建变量", (next) => {
              let root = next.doc.roots.find((n) => n.name === component.value);
              if (!root) {
                root = V.makeBlock(component.value);
                next.doc.roots.push(root);
              }
              let group = V.block(root, scope.value);
              if (!group) {
                group = V.makeBlock(scope.value);
                root.members.push(group);
              }
              if (group.members.some((n) => n.name === name.value))
                throw new Error("变量名重复");
              const raw =
                type.value === "text"
                  ? V.literal(value.value)
                  : type.value === "color" && value.value.startsWith("#")
                    ? V.colorRaw(value.value)
                    : value.value;
              if (scope.value === "ui") {
                const field = V.makeBlock(name.value, {
                  label: name.value,
                  type: type.value === "color" ? "number" : type.value,
                  control: control.value,
                });
                V.setRaw(field, "default", raw);
                if (["number", "slider"].includes(control.value)) {
                  V.setRaw(field, "min", min.value);
                  V.setRaw(field, "max", max.value);
                  V.setRaw(field, "step", step.value);
                }
                if (["choice", "select"].includes(control.value)) {
                  const labels = options.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (!labels.length) throw new Error("请声明选项");
                  field.members.push(
                    V.makeBlock(
                      "choices",
                      Object.fromEntries(labels.map((s, i) => ["c" + i, s])),
                    ),
                  );
                }
                group.members.push(field);
              } else V.setRaw(group, name.value, raw);
            })
          )
            throw new Error("变量声明未通过校验");
          closeDialog($("editDialog"));
          inspectorTab = "variables";
          renderInspector();
        },
      },
    ],
  );
}
function download(filename, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    link = element("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportDialog() {
  let source;
  try {
    flush();
    source = M.projectSource(project);
    V.parse(source);
  } catch (error) {
    toast(error.message);
    return;
  }
  dialog(
    "导出预设",
    (body) => {
      const code = element("pre", "code", source);
      body.append(code);
      $("editDialog").classList.add("wide-dialog");
      body.append(
        element(
          "p",
          "panel-hint",
          "Vina 文件用于 Pogget；工程文件包含画板、基础预设及编辑状态，可继续编辑。",
        ),
      );
    },
    [
      {
        label: "复制源码",
        run: async () => {
          await navigator.clipboard.writeText(source);
          toast("源码已复制");
        },
      },
      {
        label: "保存工程",
        run: () => {
          let data = V.clone(project);
          if (
            !data.base &&
            project.doc.roots.some((n) => n.name === "Preset")
          ) {
            try {
              const name = V.evaluateExpression(
                V.expressionOf(
                  V.property(
                    project.doc.roots.find((n) => n.name === "Preset"),
                    "dependsOn",
                  ),
                ),
              );
              if (name.toLowerCase() === "pogget_std") {
                data.base = standard;
                data.baseName = "Pogget_Std";
              }
            } catch {}
          }
          download(
            (project.name || "MyPreset") + ".vina-project.json",
            JSON.stringify(data, null, 2),
            "application/json;charset=utf-8",
          );
        },
      },
      {
        label: "下载 .vina",
        primary: true,
        run: () => download((project.name || "MyPreset") + ".vina", source),
      },
    ],
  );
}
async function importFile(file, mode = "project") {
  if (!file || running) return;
  if (file.size > 4 * 1024 * 1024) {
    toast("文件超过 4 MiB，请缩小文件后导入");
    return;
  }
  const revision = ++importRevision;
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    if (revision !== importRevision || running) return;
    if (mode === "base") {
      const base = V.parse(source);
      if (base.roots.some((n) => n.name === "Preset"))
        throw new Error("请选择独立基础预设，不能包含依赖链");
      const declaration = project.doc.roots.find((n) => n.name === "Preset");
      if (!declaration) throw new Error("请先在预设中填写基础预设名称");
      const name = V.evaluateExpression(
        V.expressionOf(V.property(declaration, "dependsOn")),
      );
      if (
        file.name.replace(/\.vina$/i, "").toLowerCase() !== name.toLowerCase()
      )
        throw new Error(`基础文件应为 ${name}.vina`);
      mutate("导入基础预设", (next) => {
        next.base = base;
        next.baseName = name;
      });
      return;
    }
    const next = /\.json$/i.test(file.name)
      ? M.projectFromJSON(source)
      : M.projectFromVina(source, project);
    next.name = file.name.replace(/(?:\.vina-project)?\.(vina|json)$/i, "");
    const applied = mutate(
      "导入 " + file.name,
      (target) => Object.assign(target, next),
      { allowMissingBase: true },
    );
    if (applied) {
      selection = [];
      renderAll();
      toast("已导入；Ctrl+Z 可恢复导入前的工程");
    }
  } catch (error) {
    toast("导入失败：" + error.message);
    status("导入失败，当前工程已保留", true);
  }
}
function command(name) {
  if (running) return;
  const ids = M.selectedRoots(project.doc, selection);
  if (name === "copy") {
    if (ids.length) {
      clipboard = M.copySelection(project.doc, ids, modelInputs());
      toast("组件已复制");
    }
    return;
  }
  if (name === "paste") {
    if (!clipboard) return;
    mutate("粘贴组件", (next) => {
      selection = M.pasteSelection(next.doc, clipboard, modelInputs());
    });
    return;
  }
  if (!ids.length) return;
  if (ids.some(isLocked)) {
    toast("请先解锁所选图层");
    return;
  }
  mutate(
    {
      delete: "删除组件",
      duplicate: "复制组件",
      group: "编组",
      ungroup: "解除编组",
      root: "移到根层",
      raise: "上移图层",
      lower: "下移图层",
    }[name] || "排列组件",
    (next) => {
      if (name === "delete") {
        M.removeViews(next, ids, standard, modelInputs());
        next.locks = next.locks.filter((id) => V.index(next.doc).byId.has(id));
        selection = [];
      } else if (name === "duplicate")
        selection = M.duplicate(next.doc, ids, modelInputs());
      else if (name === "group")
        selection = [M.group(next.doc, ids, modelInputs())];
      else if (name === "ungroup")
        selection = M.ungroup(next.doc, ids, modelInputs());
      else if (name === "root") M.reparent(next.doc, ids, null, modelInputs());
      else if (name === "raise" || name === "lower")
        M.reorder(next.doc, ids, name === "raise" ? 1 : -1, modelInputs());
      else if (name.startsWith("align-"))
        M.align(next.doc, ids, name.slice(6), modelInputs());
      else if (name.startsWith("distribute"))
        M.align(next.doc, ids, name, modelInputs());
    },
  );
}
function boardPoint(event) {
  const rect = $("scene").getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom,
  };
}
function shifted(raw, delta) {
  const expr = V.parseExpression(raw || "0");
  if ("value" in expr && typeof expr.value === "number")
    return String(+(expr.value + delta).toFixed(4));
  const existing = /^\(([\s\S]*)\) \+ \((-?[\d.eE+]+)\)$/.exec(raw || "");
  if (existing)
    return `(${existing[1]}) + (${+(Number(existing[2]) + delta).toFixed(4)})`;
  return `(${raw || "0"}) + (${+delta.toFixed(4)})`;
}
function addComponent(type, point) {
  mutate("添加 " + (NAMES[type] || type), (next) => {
    const parent =
      selection.length === 1 &&
      scene?.frames.get(selection[0])?.p.type === "group" &&
      !isLocked(selection[0])
        ? selection[0]
        : null;
    const origin = parent ? scene.frames.get(parent) : { x: 0, y: 0 };
    const n = V.createView(
      next.doc,
      type,
      (point?.x ?? origin.x + 20) - origin.x,
      (point?.y ?? origin.y + 20) - origin.y,
      parent,
      scene?.runtime.doc.roots.map((n) => n.name) || [],
    );
    selection = [n.id];
  });
}
function finishDrag(cancel = false) {
  const d = drag;
  if (!d) return;
  drag = null;
  if (d.kind === "library") {
    document.querySelector(".library-ghost")?.remove();
    if (!cancel && d.moved) {
      const rect = $("board").getBoundingClientRect();
      if (
        d.clientX >= rect.left &&
        d.clientX <= rect.right &&
        d.clientY >= rect.top &&
        d.clientY <= rect.bottom
      )
        addComponent(d.type, {
          x: (d.clientX - rect.left) / zoom,
          y: (d.clientY - rect.top) / zoom,
        });
    }
    return;
  }
  if (d.kind === "pan") return;
  if (d.kind === "run") {
    if (cancel || d.cancelled) return;
    const f = scene?.frames.get(d.id),
      point = d.last || d.start;
    if (!f || !hitFrame(scene, d.id, point)) return;
    const p = f.p,
      held = (performance.now() - d.time) / 1000 >= (p.holdDelay ?? 0.4);
    const previousOverrides = { ...runtimeOverrides };
    const action = held && p.holdAction ? p.holdAction : p.action;
    if (p.toggle && !(held && p.holdAction)) {
      const state = p.toggle.startsWith("state.")
        ? f.path.split(".")[0] + "." + p.toggle
        : p.toggle;
      const value = scene.runtime.get(state);
      if (typeof value === "boolean") runtimeOverrides[state] = !value;
    }
    if (action) {
      if (action === "pogget.action.view.toggle")
        runtimeOverrides["pogget.isListView"] =
          !currentInputs["pogget.isListView"];
      else if (action === "pogget.action.view.list")
        runtimeOverrides["pogget.isListView"] = true;
      else if (action === "pogget.action.view.grid")
        runtimeOverrides["pogget.isListView"] = false;
      else if (action === "pogget.action.container.lock")
        runtimeOverrides["pogget.locked"] = !currentInputs["pogget.locked"];
      else if (action === "pogget.action.container.toggleCollapse")
        runtimeOverrides["pogget.collapsed"] =
          !currentInputs["pogget.collapsed"];
      else if (action === "pogget.action.container.collapse")
        runtimeOverrides["pogget.collapsed"] = true;
      else if (action === "pogget.action.container.expand")
        runtimeOverrides["pogget.collapsed"] = false;
      else toast("在 Pogget 内执行：" + action);
    }
    try {
      M.validate(project, standard, inputValues(), schema);
    } catch (error) {
      runtimeOverrides = previousOverrides;
      toast("交互未应用：" + error.message);
    }
    renderCanvas();
    renderInspector();
    return;
  }
  if (d.kind === "marquee") {
    document.querySelector(".marquee")?.remove();
    if (cancel) {
      selection = d.selection;
      return;
    }
    const end = d.last || d.start,
      x = Math.min(d.start.x, end.x),
      y = Math.min(d.start.y, end.y),
      w = Math.abs(end.x - d.start.x),
      h = Math.abs(end.y - d.start.y);
    if (w < 3 && h < 3) {
      select(d.add ? d.selection : []);
      return;
    }
    const found = [...scene.frames]
      .filter(
        ([id, f]) =>
          idx().byId.has(id) &&
          hasVisiblePaint(scene, f) &&
          !isLocked(id) &&
          f.paintX < x + w &&
          f.paintX + f.w > x &&
          f.paintY < y + h &&
          f.paintY + f.h > y,
      )
      .map(([id]) => id);
    select(d.add ? [...new Set([...d.selection, ...found])] : found);
    return;
  }
  if (cancel) {
    project = d.before;
    selection = d.selection;
    renderAll();
    status("操作已取消");
    return;
  }
  if (!d.moved) return;
  try {
    M.validate(project, standard, inputValues(), schema);
    markCommitted(
      d.kind === "point"
        ? "编辑路径点"
        : d.kind === "resize"
          ? "调整尺寸"
          : "移动组件",
    );
    renderAll();
  } catch (error) {
    project = d.before;
    selection = d.selection;
    renderAll();
    toast(error.message);
  }
}
function pointerDown(event) {
  if (event.button !== 0 && event.button !== 1) return;
  const point = boardPoint(event),
    target = event.target;
  if (target.closest("button") && !target.closest("[data-point]")) return;
  if (event.button === 1 || spaceHeld) {
    event.preventDefault();
    drag = {
      kind: "pan",
      clientX: event.clientX,
      clientY: event.clientY,
      left: $("canvasWrap").scrollLeft,
      top: $("canvasWrap").scrollTop,
    };
    $("board").setPointerCapture(event.pointerId);
    return;
  }
  const dot = target.closest("[data-point]"),
    resize = target.closest("[data-resize]"),
    picked = pickScene(
      scene,
      point,
      { x: event.clientX, y: event.clientY },
      running,
    );
  let id = dot?.dataset.id || resize?.dataset.resize || picked?.node.id;
  if (running) {
    trackHover(point);
    const frame = picked;
    if (frame && frame.visible && frame.enabled) {
      drag = {
        kind: "run",
        id: frame.node.id,
        start: point,
        time: performance.now(),
      };
      $("board").setPointerCapture(event.pointerId);
    }
    return;
  }
  flush();
  if (id && !idx().byId.has(id)) {
    select([]);
    toast(
      "这是基础预设图层。请在源码中添加同路径覆盖，或导入完整基础文件编辑。",
    );
    return;
  }
  if (id) {
    event.preventDefault();
    if (!selection.includes(id)) {
      select([id], event.shiftKey || event.ctrlKey || event.metaKey);
    } else if (
      (event.shiftKey || event.ctrlKey || event.metaKey) &&
      !dot &&
      !resize
    ) {
      select(selection.filter((v) => v !== id));
      return;
    }
    if (isLocked(id)) return;
    if (
      dot &&
      V.references(V.expressionOf(V.property(idx().byId.get(id), "points")))
        .length
    ) {
      toast("点列已绑定变量，请先解除绑定或编辑变量");
      return;
    }
    const kind = dot ? "point" : resize ? "resize" : "move",
      ids = kind === "move" ? M.selectedRoots(project.doc, selection) : [id];
    if (ids.some(isLocked)) {
      toast("请先解锁所选图层");
      return;
    }
    drag = {
      kind,
      ids,
      id,
      start: point,
      before: V.clone(project),
      selection: [...selection],
      frames: new Map(scene.frames),
      pointIndex: dot ? Number(dot.dataset.point) : null,
      corner: resize?.dataset.corner || "se",
      moved: false,
    };
  } else {
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) select([]);
    drag = {
      kind: "marquee",
      start: point,
      selection: [...selection],
      add: event.shiftKey || event.ctrlKey || event.metaKey,
    };
    const marquee = element("div", "marquee");
    $("overlays").append(marquee);
  }
  $("board").setPointerCapture(event.pointerId);
}
function pointerMove(event) {
  const d = drag;
  if (!d) {
    if (running) trackHover(boardPoint(event));
    return;
  }
  if (d.kind === "library") {
    d.clientX = event.clientX;
    d.clientY = event.clientY;
    d.moved ||=
      Math.hypot(event.clientX - d.startX, event.clientY - d.startY) > 5;
    if (d.moved) {
      let ghost = document.querySelector(".library-ghost");
      if (!ghost) {
        ghost = element("div", "library-ghost");
        ghost.append(
          icon(COMPONENT_ICONS[d.type]),
          element("span", "", NAMES[d.type] || d.type),
        );
        document.body.append(ghost);
      }
      ghost.style.left = event.clientX + 12 + "px";
      ghost.style.top = event.clientY + 12 + "px";
    }
    return;
  }
  if (d.kind === "pan") {
    $("canvasWrap").scrollLeft = d.left - (event.clientX - d.clientX);
    $("canvasWrap").scrollTop = d.top - (event.clientY - d.clientY);
    return;
  }
  const point = boardPoint(event);
  d.last = point;
  if (d.kind === "run") {
    if (!hitFrame(scene, d.id, point)) d.cancelled = true;
    trackHover(point);
    return;
  }
  if (d.kind === "marquee") {
    const n = document.querySelector(".marquee");
    if (n)
      n.style.cssText = `left:${Math.min(point.x, d.start.x)}px;top:${Math.min(point.y, d.start.y)}px;width:${Math.abs(point.x - d.start.x)}px;height:${Math.abs(point.y - d.start.y)}px`;
    return;
  }
  let dx = point.x - d.start.x,
    dy = point.y - d.start.y;
  if (!d.moved && Math.hypot(dx, dy) < 2) return;
  d.moved = true;
  if (event.shiftKey && d.kind === "move") {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  if ($("snapGrid").checked) {
    dx = Math.round(dx / 8) * 8;
    dy = Math.round(dy / 8) * 8;
  }
  project = V.clone(d.before);
  const i = idx();
  if (d.kind === "point") {
    const f = d.frames.get(d.id),
      points = V.parsePoints(f.p.points, f.p.closed ?? true);
    points[d.pointIndex] = {
      x: Math.max(
        -32768,
        Math.min(
          32768,
          ((point.x - f.x) / Math.max(0.001, f.w)) * (f.p.pathWidth || 100),
        ),
      ),
      y: Math.max(
        -32768,
        Math.min(
          32768,
          ((point.y - f.y) / Math.max(0.001, f.h)) * (f.p.pathHeight || 100),
        ),
      ),
    };
    V.setValue(i.byId.get(d.id), "points", V.pointsText(points));
  } else
    for (const id of d.ids) {
      const n = i.byId.get(id),
        f = d.frames.get(id);
      if (!n || !f) continue;
      if (d.kind === "resize") {
        const bounds = resizeCorner(f, d.corner, dx, dy, event.shiftKey);
        V.setRaw(
          n,
          "width",
          shifted(V.property(n, "width")?.raw || String(f.w), bounds.w - f.w),
        );
        V.setRaw(
          n,
          "height",
          shifted(V.property(n, "height")?.raw || String(f.h), bounds.h - f.h),
        );
        const authoredY =
          currentInputs["pogget.upward"] && f.interaction === "title"
            ? -bounds.y - (bounds.h - f.h)
            : bounds.y;
        if (bounds.x)
          V.setRaw(n, "x", shifted(V.property(n, "x")?.raw || "0", bounds.x));
        if (authoredY)
          V.setRaw(n, "y", shifted(V.property(n, "y")?.raw || "0", authoredY));
      } else {
        V.setRaw(n, "x", shifted(V.property(n, "x")?.raw || "0", dx));
        V.setRaw(n, "y", shifted(V.property(n, "y")?.raw || "0", dy));
      }
    }
  renderCanvas();
  status(
    `${d.kind === "resize" ? "尺寸调整" : "移动"} ${dx.toFixed(1)}, ${dy.toFixed(1)} DIP`,
  );
}
function setRunning(on) {
  if (on && !flush()) return;
  finishDrag(true);
  if (on) {
    try {
      M.validate(project, standard, inputValues(), schema);
    } catch (error) {
      toast(error.message);
      return;
    }
    lastSelection = [...selection];
    selection = [];
  }
  cancelAnimationFrame(previewFrame);
  previewFrame = 0;
  hoverStates.clear();
  running = on;
  runtimeOverrides = {};
  if (!on) selection = lastSelection.filter((id) => idx().byId.has(id));
  $("runBtn").textContent = on ? "停止" : "运行";
  $("runBtn").classList.toggle("is-running", on);
  $("board").classList.toggle("running", on);
  for (const id of [
    "importBtn",
    "sourceBtn",
    "behaviorBtn",
    "boardWInput",
    "boardHInput",
  ])
    $(id).disabled = on;
  renderAll();
  status(on ? "交互预览 · 状态不写入工程" : "编辑模式");
}
let spaceHeld = false,
  keyboardMove = false;
function keydown(event) {
  if (document.getElementById("behaviorDialog")?.open) return;
  const editable = event.target.closest(
    'input,textarea,select,[contenteditable="true"]',
  );
  const mod = event.ctrlKey || event.metaKey,
    key = event.key.toLowerCase();
  if (event.key === "Escape") {
    if (drag) {
      finishDrag(true);
      return;
    }
    if (running) {
      setRunning(false);
      return;
    }
    closeContext();
    return;
  }
  if ($("editDialog").open) return;
  if (mod && key === "s") {
    event.preventDefault();
    flush();
    save();
    exportDialog();
    return;
  }
  if (editable) return;
  if (mod && ["z", "y"].includes(key)) {
    event.preventDefault();
    undo(key === "y" || event.shiftKey);
    return;
  }
  if (running) return;
  if (event.code === "Space") {
    spaceHeld = true;
    event.preventDefault();
    return;
  }
  if (mod && key === "a") {
    event.preventDefault();
    select(V.viewNodes(project.doc).map((v) => v.node.id));
    return;
  }
  const commandMap = {
    c: "copy",
    v: "paste",
    d: "duplicate",
    g: event.shiftKey ? "ungroup" : "group",
  };
  if (mod && commandMap[key]) {
    event.preventDefault();
    command(commandMap[key]);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    command("delete");
    return;
  }
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
    selection.length
  ) {
    event.preventDefault();
    if (selection.some(isLocked)) return;
    if (!pending) pending = V.clone(project);
    keyboardMove = true;
    const axis =
        event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y",
      delta =
        (event.shiftKey ? 10 : 1) *
        (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
    for (const id of M.selectedRoots(project.doc, selection)) {
      const n = idx().byId.get(id);
      V.setRaw(n, axis, shifted(V.property(n, axis)?.raw || "0", delta));
    }
    renderCanvas();
  }
}
function closeContext() {
  document.querySelector(".editor-context")?.remove();
}
function contextMenu(event) {
  if (running) return;
  event.preventDefault();
  closeContext();
  const hit = pickScene(scene, boardPoint(event), {
    x: event.clientX,
    y: event.clientY,
  });
  const id = hit?.node.id;
  if (id && idx().byId.has(id)) {
    if (!selection.includes(id)) select([id]);
  } else select([]);
  const menu = element("div", "editor-context");
  menu.setAttribute("role", "menu");
  for (const [label, action, enabled] of [
    ["撤销  Ctrl+Z", () => undo(), history.canUndo],
    ["重做  Ctrl+Shift+Z", () => undo(true), history.canRedo],
    ["复制  Ctrl+C", () => command("copy"), selection.length],
    ["粘贴  Ctrl+V", () => command("paste"), clipboard],
    ["创建副本  Ctrl+D", () => command("duplicate"), selection.length],
    ["编组  Ctrl+G", () => command("group"), selection.length],
    ["解除编组  Ctrl+Shift+G", () => command("ungroup"), selection.length],
    ["删除  Delete", () => command("delete"), selection.length],
  ]) {
    const item = button(
      label,
      () => {
        closeContext();
        action();
      },
      "context-item",
    );
    item.disabled = !enabled;
    item.setAttribute("role", "menuitem");
    menu.append(item);
  }
  document.body.append(menu);
  menu.style.left =
    Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8) + "px";
  menu.style.top =
    Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8) + "px";
}
function migrateLegacy(data) {
  const next = V.createProject();
  next.board = { w: Number(data.boardW) || 360, h: Number(data.boardH) || 480 };
  for (const old of data.elements || []) {
    if (!V.TYPES.includes(old.type)) continue;
    const n = V.createView(
      next.doc,
      old.type,
      Number(old.x) || 0,
      Number(old.y) || 0,
    );
    V.setValue(n, "width", Number(old.w) || 40);
    V.setValue(n, "height", Number(old.h) || 40);
    for (const [key, value] of Object.entries(old.props || {})) {
      if (value == null) continue;
      if (key === "hoverOpacity") {
        n.members.push(V.makeBlock("hover", { opacity: value }));
        continue;
      }
      if (COLORS.has(key) && typeof value === "string")
        V.setRaw(n, key, V.colorRaw(value));
      else
        V.setValue(
          n,
          key,
          key === "transition"
            ? Number(value) / 1000
            : key === "glassRenderer" && value === "liquid"
              ? "lightEffect"
              : value,
        );
    }
  }
  return next;
}
function importLocationHash() {
  try {
    const next = projectFromLink(location.hash, standard, inputValues, schema);
    if (!next) return false;
    // Commit storage before touching the live project. Quota/privacy failures
    // leave both the existing canvas and its persisted project intact.
    localStorage.setItem(STORAGE, JSON.stringify(next));
    project = next;
    history = new V.History(project);
    selection = [];
    lastSelection = [];
    pending = null;
    drag = null;
    keyboardMove = spaceHeld = false;
    document.querySelector(".marquee")?.remove();
    document.querySelector(".library-ghost")?.remove();
    closeContext();
    if ($("editDialog").open) closeDialog($("editDialog"));
    runtimeOverrides = {};
    hoverStates.clear();
    if (running) setRunning(false);
    ++importRevision; // Cancel any file import that was still reading.
    try {
      // Consume only after a successful commit, so reload never overwrites
      // subsequent work with the original incoming fragment.
      window.history.replaceState(
        null,
        "",
        location.pathname + location.search,
      );
    } catch {}
    toast("已从 Pogget 导入预设并保存到本地");
    return true;
  } catch (error) {
    toast("链接导入失败，当前工程已保留：" + error.message);
    return false;
  }
}
async function init() {
  try {
    const assets = await Promise.all(
      [
        "data/Pogget_Std.vina",
        "data/schema.json",
        "data/preview-inputs.json",
      ].map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("无法读取 " + url);
        return response.text();
      }),
    );
    standard = V.parse(assets[0]);
    schema = JSON.parse(assets[1]);
    defaults = JSON.parse(assets[2]);
    let themeMode = "system";
    try {
      themeMode = localStorage.getItem("customvina.theme") || "system";
      const raw = localStorage.getItem(STORAGE),
        legacy = localStorage.getItem("customvina.state.v1");
      if (raw) project = M.projectFromJSON(raw);
      else if (legacy) {
        project = migrateLegacy(JSON.parse(legacy));
        toast("已迁移旧版画布；旧存档仍保留");
      }
    } catch (error) {
      toast("本地存档无法读取，原始存档未改动：" + error.message);
    }
    importLocationHash();
    theme(themeMode);
    history = new V.History(project);
    window.addEventListener("hashchange", () => {
      if (!location.hash.startsWith("#c=")) return;
      if (importLocationHash()) {
        saved = true;
        $("saveStatus").textContent = "已保存到本地";
        renderAll();
      }
    });
    const example = button(
      "打开示例",
      async () => {
        try {
          const response = await fetch("examples/StudioCard.vina");
          if (!response.ok) throw new Error("示例读取失败");
          await importFile(
            new File([await response.text()], "StudioCard.vina"),
          );
        } catch (error) {
          toast(error.message);
        }
      },
      "btn-ghost",
    );
    example.style.pointerEvents = "auto";
    $("boardEmpty").append(example);
    for (const type of [
      "rect",
      "text",
      "icon",
      "image",
      "button",
      "path",
      "content",
      "glass",
    ]) {
      const item = button(
        "",
        () => {
          if (suppressLibraryClick) {
            suppressLibraryClick = false;
            return;
          }
          addComponent(type);
        },
        "comp-item",
      );
      item.dataset.type = type;
      item.title =
        type === "content"
          ? "应用内容：由 Pogget 绘制的内容区，例如 Markdown 预览或编辑区；在线画布显示占位"
          : NAMES[type];
      if (type === "glass") item.title = "模糊层：背景模糊、高光与着色效果";
      const glyph = element("span", "comp-glyph");
      glyph.append(icon(COMPONENT_ICONS[type]));
      item.append(glyph, element("span", "comp-name", NAMES[type]));
      item.addEventListener("pointerdown", (event) => {
        if (running || event.button !== 0) return;
        drag = {
          kind: "library",
          type,
          startX: event.clientX,
          startY: event.clientY,
          clientX: event.clientX,
          clientY: event.clientY,
          moved: false,
        };
        item.setPointerCapture(event.pointerId);
      });
      item.addEventListener("pointermove", pointerMove);
      item.addEventListener("pointerup", () => {
        if (drag?.kind === "library") {
          suppressLibraryClick = drag.moved;
          finishDrag();
        }
      });
      item.addEventListener("pointercancel", () => finishDrag(true));
      $("compList").append(item);
    }
    $("undoBtn").addEventListener("click", () => undo());
    $("redoBtn").addEventListener("click", () => undo(true));
    $("sourceBtn").addEventListener("click", sourceDialog);
    $("newBtn").addEventListener("click", newProjectDialog);
    $("exportBtn").addEventListener("click", exportDialog);
    $("importBtn").addEventListener("click", () => {
      inputMode = "project";
      $("fileInput").click();
    });
    $("fileInput").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      await importFile(file, inputMode);
    });
    $("themeBtn").addEventListener("click", () => {
      theme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark",
      );
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      () => {
        if (document.documentElement.dataset.themeMode === "system")
          theme("system");
      },
    );
    $("runBtn").addEventListener("click", () => setRunning(!running));
    $("behaviorBtn").addEventListener("click", () => {
      if (running || busy || !flush()) return;
      try {
        const behaviorSource = V.serialize(project.doc);
        openBehaviorEditor({
          project: V.clone(project),
          standard,
          schema,
          inputs: inputValues(),
          selectedPath: selection.length ? idx().paths.get(selection[0]) : "",
          apply: (next) => {
            if (V.serialize(project.doc) !== behaviorSource) {
              toast("工程已从外部更新，请关闭行为节点后重新打开。");
              return false;
            }
            return mutate("应用行为节点", (target) => {
              target.doc = next.doc;
              target.behaviorGraph = next.behaviorGraph;
            });
          },
          notify: toast,
        });
      } catch (error) {
        toast("行为节点打开失败：" + error.message);
      }
    });
    $("propertiesTab").addEventListener("click", () => {
      inspectorTab = "properties";
      renderInspector();
    });
    $("variablesTab").addEventListener("click", () => {
      inspectorTab = "variables";
      renderInspector();
    });
    $("layerSearch").addEventListener("input", renderLayers);
    $("showBase").addEventListener("change", renderCanvas);
    $("previewState").addEventListener("change", () => {
      hostState = $("previewState").value;
      hoverStates.clear();
      runtimeOverrides = {};
      renderAll();
    });
    $("previewSettingsBtn").addEventListener("click", previewSettingsDialog);
    $("zoomSelect").addEventListener("change", () => {
      zoom = Number($("zoomSelect").value);
      renderCanvas();
    });
    $("arrangeSelect").addEventListener("change", () => {
      command($("arrangeSelect").value);
      $("arrangeSelect").value = "";
    });
    for (const [key, id] of [
      ["w", "boardWInput"],
      ["h", "boardHInput"],
    ])
      $(id).addEventListener("change", () => {
        const value = Number($(id).value);
        mutate("修改画板尺寸", (next) => {
          next.board[key] = value;
        });
        $(id).value = project.board[key];
      });
    document
      .querySelectorAll("[data-command]")
      .forEach((n) =>
        n.addEventListener("click", () => command(n.dataset.command)),
      );
    $("board").addEventListener("pointerdown", pointerDown);
    $("board").addEventListener("pointermove", pointerMove);
    $("board").addEventListener("pointerleave", () => {
      if (running) trackHover(null);
    });
    $("board").addEventListener("pointerup", () => finishDrag());
    $("board").addEventListener("pointercancel", () => finishDrag(true));
    $("board").addEventListener("lostpointercapture", () => {
      if (drag) finishDrag(true);
    });
    $("canvasWrap").addEventListener("contextmenu", contextMenu);
    $("board").addEventListener("dblclick", (event) => {
      if (
        running ||
        event.target.closest("[data-point]") ||
        selection.length !== 1
      )
        return;
      const id = selection[0],
        f = scene.frames.get(id);
      if (f?.p.type !== "path" || isLocked(id)) return;
      const node = idx().byId.get(id);
      if (V.references(V.expressionOf(V.property(node, "points"))).length)
        return;
      const point = boardPoint(event);
      mutate("添加路径点", (next) => {
        const points = V.parsePoints(f.p.points, f.p.closed ?? true);
        points.push({
          x: ((point.x - f.x) / Math.max(0.001, f.w)) * (f.p.pathWidth || 100),
          y: ((point.y - f.y) / Math.max(0.001, f.h)) * (f.p.pathHeight || 100),
        });
        V.setValue(
          V.index(next.doc).byId.get(id),
          "points",
          V.pointsText(points),
        );
      });
    });
    $("canvasWrap").addEventListener("dragover", (event) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault();
    });
    $("canvasWrap").addEventListener("drop", (event) => {
      if (event.dataTransfer.files.length) {
        event.preventDefault();
        importFile(event.dataTransfer.files[0]);
      }
    });
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") spaceHeld = false;
      if (keyboardMove && event.key.startsWith("Arrow")) {
        keyboardMove = false;
        flush();
        renderInspector();
      }
    });
    window.addEventListener("blur", () => {
      spaceHeld = false;
      finishDrag(true);
      flush();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".editor-context")) closeContext();
    });
    $("dialogClose").addEventListener("click", () =>
      closeDialog($("editDialog")),
    );
    $("editDialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog($("editDialog"));
    });
    $("dialogForm").addEventListener("submit", (event) =>
      event.preventDefault(),
    );
    const versionMask = $("versionMask");
    const closeVersionModal = () => {
      versionMask.classList.remove("show");
      versionMask.setAttribute("aria-hidden", "true");
    };
    const openVersionModal = () => {
      versionMask.classList.add("show");
      versionMask.setAttribute("aria-hidden", "false");
    };
    $("versionBadge").addEventListener("click", openVersionModal);
    $("versionClose").addEventListener("click", closeVersionModal);
    $("versionOk").addEventListener("click", closeVersionModal);
    versionMask.addEventListener("click", (event) => {
      if (event.target === versionMask) closeVersionModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && versionMask.classList.contains("show")) {
        closeVersionModal();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      finishDrag(true);
      flush();
      if (pending) save();
      if (!saved) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    renderAll();
    status("就绪 · Vina " + schema.revision);
    $("saveStatus").textContent = "本地自动保存";
    // Read-only diagnostics make automated browser regressions inspect real state.
    window.vinaEditor = Object.freeze({
      get project() {
        return V.clone(project);
      },
      get selection() {
        return [...selection];
      },
      get history() {
        return {
          undo: history.canUndo,
          redo: history.canRedo,
          length: history.entries.length,
          position: history.position,
        };
      },
      get source() {
        return M.projectSource(project);
      },
      get preview() {
        return {
          host: isHostPreset(project.doc),
          state: hostState,
          inputs: { ...currentInputs },
          frames: [...(scene?.frames.values() || [])].map(
            ({ path, x, y, w, h, p, slot, visible, active, alpha }) => ({
              path,
              x,
              y,
              w,
              h,
              p: { ...p },
              slot,
              visible,
              active,
              alpha,
            }),
          ),
        };
      },
    });
    document.documentElement.dataset.ready = "true";
  } catch (error) {
    status("初始化失败：" + error.message, true);
    $("inspBody").append(
      element("p", "panel-hint", "请通过 npm start 或静态网站服务打开编辑器。"),
      button("重新加载", () => location.reload(), "btn-primary"),
    );
  }
}
let suppressLibraryClick = false;
init();
