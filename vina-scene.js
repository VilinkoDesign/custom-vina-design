import { Runtime, viewNodes, block, property, META } from "./vina-core.js";
import { resolveHover } from "./vina-preview.js";
import { poggetTheme } from "./vina-theme.js";

function displayUnits(text) {
  let units = 0;
  for (const character of String(text || "")) {
    const code = character.codePointAt(0);
    const zeroWidth = code === 0x200d ||
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x1ab0 && code <= 0x1aff) ||
      (code >= 0x1dc0 && code <= 0x1dff) ||
      (code >= 0x20d0 && code <= 0x20ff) ||
      (code >= 0xfe00 && code <= 0xfe0f) ||
      (code >= 0xfe20 && code <= 0xfe2f) ||
      (code >= 0xe0100 && code <= 0xe01ef);
    if (zeroWidth) continue;
    const wide = (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2329 && code <= 0x232a) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f1e6 && code <= 0x1f1ff) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd);
    units += wide ? 2 : 1;
  }
  return units;
}
function omitDisplayUnits(text, retained) {
  const source = String(text || "");
  if (!source) return source;
  if (retained <= 0) return "...";
  let used = 0, keepLength = 0;
  for (const character of source) {
    const units = displayUnits(character);
    if (used + units > retained) break;
    used += units;
    keepLength += character.length;
  }
  if (keepLength >= source.length) return source;
  if (!keepLength) return "...";
  return source.slice(0, keepLength) + "...";
}

const HOST_COMPONENTS = new Set([
  "Background",
  "Tag",
  "VinaIcon",
  "Behavior",
  "ContainerFrame",
  "TitleSurface",
  "TitleButtons",
  "TitleTag",
  "TitleTabs",
  "TitleSearch",
  "FileIconSurface",
  "FileIconContent",
  "FileIconText",
  "FilePreview",
  "FileIconMotion",
  "FileGhost",
  "PageIndicator",
  "MarkdownEditor",
  "InlineContent",
]);
export function isHostPreset(doc) {
  const dependency = doc.roots.find((n) => n.name === "Preset");
  return (
    Boolean(dependency && doc.roots.some((n) => HOST_COMPONENTS.has(n.name))) ||
    doc.roots.some((n) =>
      property(block(n, "view"), "type")?.raw.includes('"pogget.native.'),
    )
  );
}

// Slots are paint passes invoked by the host, rather than independent widgets
// that can all be painted into the same window at once.
export function hostSlotActive(slot, state = "expanded") {
  if (!slot) return true;
  if (slot.startsWith("titleSearch")) return state === "search";
  if (slot === "titleTab") return state === "tabs";
  if (slot.startsWith("inlineSearch") || slot.startsWith("inlineContent"))
    return false;
  if (slot.startsWith("markdownEditor")) return state === "markdown";
  if (state === "markdown") return false;
  if (
    slot.startsWith("fileIcon") ||
    slot === "filePreview" ||
    slot === "fileGhost"
  )
    return false;
  return true;
}
export function hostLayer(slot) {
  if (slot === "containerFrame") return 90;
  if (slot === "titleSurface") return 20;
  if (slot === "titleTag") return 30;
  if (slot.startsWith("title")) return 40;
  return 10;
}
export function previewInputs(
  defaults,
  board,
  dark,
  host = false,
  state = "expanded",
  overrides = {},
) {
  const result = {
    ...defaults,
    "pogget.width": board.w,
    "pogget.height": board.h,
    ...poggetTheme(dark),
  };
  if (host)
    Object.assign(result, {
      "pogget.containerFrame.widthPixels": board.w,
      "pogget.containerFrame.heightPixels":
        state === "collapsed" ? defaults["pogget.collapsedHeight"] : board.h,
      "pogget.pageIndicator.width": board.w,
      "pogget.pageIndicator.height": board.h,
      "pogget.markdownEditor.width": board.w,
      "pogget.markdownEditor.height": board.h,
      "pogget.editor.width": Math.max(1, board.w - 40),
      "pogget.height":
        state === "collapsed" ? defaults["pogget.collapsedHeight"] : board.h,
      "pogget.collapsed": state === "collapsed",
      "pogget.titleProgress": state === "collapsed" ? 0 : 1,
      "pogget.searching": state === "search",
      "pogget.buttonColor": result["pogget.theme.white"],
      "pogget.titleColor": result["pogget.theme.midnight"],
      "pogget.titleBorderColor": (dark ? 60 : 205) * 0x010101,
    });
  return Object.assign(result, overrides);
}

// Resolve paint frames separately from DOM drawing, so the actual native
// ViewTree can verify geometry, inherited state and paint defaults directly.
export function resolveScene(doc, inputs, options = {}) {
  const runtime = new Runtime(doc, inputs), frames = new Map(), instances = [], children = new Map();
  const entries = viewNodes(doc);
  for (const entry of entries) {
    const list = children.get(entry.parent?.id || null) || [];
    list.push(entry); children.set(entry.parent?.id || null, list);
  }
  const hash = (text) => {
    let value = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619) >>> 0;
    return value >>> 0;
  };
  const repeatPlan = (node, path) => {
    const repeat = block(node, "repeat");
    if (!repeat) return null;
    const get = (key, fallback = 0) => runtime.get(path + ".repeat." + key, fallback);
    if (property(repeat, "count")) {
      const count = Number(get("count"));
      if (!Number.isInteger(count) || count < 0 || count > 256) throw new Error(`${path}.repeat.count：范围为 0..256 的整数`);
      return { count, columns: Math.max(1, count), stepX: 0, stepY: 0, originX: 0, originY: 0, stagger: 0 };
    }
    const columns = Number(get("columns")), rows = Number(get("rows"));
    const stepX = Number(get("stepX")), stepY = Number(get("stepY"));
    const originX = Number(get("originX")), originY = Number(get("originY")), stagger = Number(get("stagger"));
    if (![columns, rows].every(Number.isInteger) || columns < 0 || rows < 0 || columns > 4096 || rows > 4096 ||
      (columns && rows > Math.floor(4096 / columns)) || ![stepX, stepY, originX, originY, stagger].every(Number.isFinite) ||
      stepX <= 0 || stepY <= 0 || stepX > 32768 || stepY > 32768 || Math.abs(originX) > 32768 || Math.abs(originY) > 32768 || stagger < 0 || stagger > 1)
      throw new Error(`${path}.repeat：网格参数无效`);
    return { count: columns * rows, columns: Math.max(1, columns), stepX, stepY, originX, originY, stagger };
  };
  const makeFrame = (entry, parentFrame, repeated = false) => {
    const { node, parent, component } = entry;
    const raw = resolveHover(runtime, node, options.hover?.get(node.id) || 0, options.defaults, options.bounds);
    const type = raw.type || (node.members.some((m) => m.kind === "block" && !META.has(m.name)) ? "group" : "text");
    if (type.startsWith("pogget.native.") && type !== "pogget.native.Background") return null;
    const nativeBackground = type === "pogget.native.Background";
    const w = Number(nativeBackground ? (inputs["pogget.width"] ?? 40) : (raw.width ?? raw.w ?? 40));
    const h = Number(nativeBackground ? (inputs["pogget.height"] ?? 40) : (raw.height ?? raw.h ?? 40));
    const x = Number(nativeBackground ? 0 : (raw.x ?? 0)), y = Number(nativeBackground ? 0 : (raw.y ?? 0));
    if (![w, h, x, y].every(Number.isFinite)) throw new Error("无效布局");
    const path = runtime.idx.paths.get(node.id), fillGradient = block(node, "backgroundGradient");
    const hasFillGradient = Boolean(fillGradient && runtime.get(path + ".backgroundGradient.enabled", true));
    const p = { type, width: w, height: h, x, y, opacity: 1, visible: true, enabled: true, radius: 0,
      background: inputs["pogget.theme.midnight"] ?? 0, color: inputs["pogget.theme.white"] ?? 0xffffff,
      borderColor: inputs["pogget.theme.white"] ?? 0xffffff, fillOpacity: 1, borderOpacity: 1,
      border: type === "path" ? 1 : 0, textSize: 14, textX: 0, font: "Segoe UI", align: "center", clipRadius: 0,
      blendMode: "normal", blur: 0, blurRenderer: "title", shadowOpacity: 0, shadowColor: 0, shadowX: 0, shadowY: 4,
      shadowBlur: 16, shadowQuality: 4, glassRenderer: "standard", glassOpacity: 1, glassBorder: 1, glassActive: false,
      closed: true, smooth: false, tension: 0.25, pathWidth: 100, pathHeight: 100, ...raw };
    p.textY = raw.textY ?? (h - p.textSize) * 0.5;
    if (nativeBackground) {
      p.background = Number(inputs["pogget.ui.CustomBackgroundColor"] === 1
        ? (inputs["pogget.containerFrame.background"] ?? inputs["pogget.theme.midnight"] ?? 0)
        : (inputs["pogget.theme.midnight"] ?? 0));
      p.fillOpacity = Number(raw.backgroundAlpha ?? 1);
      p.radius = Number(raw.cornerRad ?? inputs["pogget.cornerRadius"] ?? 0);
      p.shadowOpacity = Number(raw.shadowAlpha ?? 0);
      p.shadowBlur = Number(raw.shadowBlur ?? 16);
      p.shadowX = Number(raw.shadowOffsetX ?? 0);
      p.shadowY = Number(raw.shadowOffsetY ?? 4);
      p.border = Number(raw.TransparentFrameMode ?? 0) > 0 ? 1 : 0;
      p.borderColor = Number(inputs["pogget.containerFrame.borderColor"] ?? inputs["pogget.theme.bgSubtleStrong"] ?? 0);
      p.borderOpacity = Number(raw.BorderOpacity ?? 1);
    }
    p.borderOnly = raw.borderOnly ?? (type === "path" && !property(node, "background") && !hasFillGradient);
    const slot = raw.slot || parentFrame?.slot || "";
    if (typeof p.label === "string") {
      const explicitOmit = Number(p.textOmitUnits) || 0;
      const titleTagText = slot === "titleTag" && p.textSize === 14;
      const titleUnits = titleTagText ? Math.max(1, Math.floor(Math.max(1, w - 14) / 7)) : 0;
      const retained = explicitOmit > 0 ? explicitOmit : titleUnits;
      if (retained > 0 && displayUnits(p.label) > retained) {
        p.label = omitDisplayUnits(p.label, Math.max(1, retained - (explicitOmit > 0 ? 0 : 3)));
        p.textNoWrap = true;
        p.textClip = true;
      }
    }
    const frame = { node, parent, component, path, p, w, h, x: x + (parentFrame?.x || 0), y: y + (parentFrame?.y || 0),
      parentId: parent?.id, parentFrame, sourceId: node.id, repeated, slot,
      interaction: raw.interaction || raw.role || parentFrame?.interaction || "",
      visible: Boolean(p.visible) && (parentFrame?.visible ?? true), enabled: Boolean(p.enabled) && (parentFrame?.enabled ?? true),
      alpha: p.opacity * (parentFrame?.alpha ?? 1), blend: p.blendMode,
      hasFill: type !== "glass" && (nativeBackground || Boolean(property(node, "background")) || hasFillGradient || ["rect", "rectangle", "button", "container", "solid"].includes(type)),
      active: !options.host || hostSlotActive(slot, options.hostState) };
    instances.push(frame);
    if (!frames.has(node.id)) frames.set(node.id, frame);
    return frame;
  };
  const emit = (entry, parentFrame) => {
    const { node, component } = entry, path = runtime.idx.paths.get(node.id), plan = repeatPlan(node, path);
    if (plan) {
      const saved = { ...runtime.repeatItem };
      for (let index = 0; index < plan.count; index++) {
        const column = index % plan.columns, row = Math.floor(index / plan.columns);
        runtime.setRepeatItem({ index, column, row, x: plan.originX + (column + (row % 2 ? plan.stagger : 0)) * plan.stepX,
          y: plan.originY + row * plan.stepY, key: hash(path + ":" + index) });
        const frame = makeFrame(entry, parentFrame, true);
        if (!frame) continue;
        for (const child of children.get(node.id) || []) emit(child, frame);
      }
      runtime.setRepeatItem(saved);
      return;
    }
    const frame = makeFrame(entry, parentFrame, false);
    if (!frame) return;
    for (const child of children.get(node.id) || []) emit(child, frame);
  };
  for (const entry of children.get(null) || []) emit(entry, null);
  // SceneNode anchors each title primitive to the bottom edge when the host
  // expands upward. Keep authored world coordinates intact for source edits.
  const layers = new Map();
  if (options.host)
    for (const f of instances)
      if (f.active)
        layers.set(
          f.component.id,
          Math.max(layers.get(f.component.id) || 0, hostLayer(f.slot)),
        );
  for (const frame of instances) {
    frame.stackZ =
      (!frame.parent && options.host
        ? (layers.get(frame.component.id) || 0) * 65536
        : 0) + (Number(frame.p.z) || 0);
    frame.paintX = frame.x;
    frame.paintY =
      options.host && inputs["pogget.upward"] && frame.interaction === "title"
        ? inputs["pogget.height"] - frame.y - frame.h
        : frame.y;
  }
  return { runtime, frames, instances };
}

export function hostPreviewInputs(doc, inputs, state) {
  if (state !== "search") return inputs;
  // BindNativeEdit receives the actual control bounds after the host lays it
  // out from titleSearchInput. Child paints reference these measured inputs.
  const { frames } = resolveScene(doc, inputs);
  const editor = [...frames.values()].find(
    (f) => f.slot === "titleSearchInput",
  );
  if (!editor) return inputs;
  return {
    ...inputs,
    "pogget.editor.x": Math.trunc(editor.x),
    "pogget.editor.y": Math.trunc(editor.y),
    "pogget.editor.width": Math.max(1, Math.trunc(editor.w)),
    "pogget.editor.height": Math.max(1, Math.trunc(editor.h)),
  };
}
