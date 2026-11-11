import { Runtime, viewNodes, block, property, META } from "./vina-core.js";
import { resolveHover } from "./vina-preview.js";
import { poggetTheme } from "./vina-theme.js";

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
  const runtime = new Runtime(doc, inputs),
    frames = new Map();
  for (const { node, parent, component } of viewNodes(doc)) {
    const raw = resolveHover(
      runtime,
      node,
      options.hover?.get(node.id) || 0,
      options.defaults,
      options.bounds,
    );
    const type =
      raw.type ||
      (node.members.some((m) => m.kind === "block" && !META.has(m.name))
        ? "group"
        : "text");
    if (type.startsWith("pogget.native.")) continue;
    const w = Number(raw.width ?? raw.w ?? 40),
      h = Number(raw.height ?? raw.h ?? 40);
    const x = Number(raw.x ?? 0),
      y = Number(raw.y ?? 0);
    if (![w, h, x, y].every(Number.isFinite)) throw new Error("无效布局");
    const path = runtime.idx.paths.get(node.id),
      parentFrame = frames.get(parent?.id);
    const fillGradient = block(node, "backgroundGradient");
    const hasFillGradient = Boolean(
      fillGradient && runtime.get(path + ".backgroundGradient.enabled", true),
    );
    const p = {
      type,
      width: w,
      height: h,
      x,
      y,
      opacity: 1,
      visible: true,
      enabled: true,
      radius: 0,
      background: inputs["pogget.theme.midnight"] ?? 0,
      color: inputs["pogget.theme.white"] ?? 0xffffff,
      borderColor: inputs["pogget.theme.white"] ?? 0xffffff,
      fillOpacity: 1,
      borderOpacity: 1,
      border: type === "path" ? 1 : 0,
      textSize: 14,
      textX: 0,
      font: "Segoe UI",
      align: "center",
      clipRadius: 0,
      blendMode: "normal",
      blur: 0,
      blurRenderer: "title",
      shadowOpacity: 0,
      shadowColor: 0,
      shadowX: 0,
      shadowY: 4,
      shadowBlur: 16,
      shadowQuality: 4,
      glassRenderer: "standard",
      glassOpacity: 1,
      glassBorder: 1,
      glassActive: false,
      closed: true,
      smooth: false,
      tension: 0.25,
      pathWidth: 100,
      pathHeight: 100,
      ...raw,
    };
    p.textY = raw.textY ?? (h - p.textSize) * 0.5;
    p.borderOnly =
      raw.borderOnly ??
      (type === "path" && !property(node, "background") && !hasFillGradient);
    const slot = raw.slot || parentFrame?.slot || "";
    const frame = {
      node,
      parent,
      component,
      path,
      p,
      w,
      h,
      x: x + (parentFrame?.x || 0),
      y: y + (parentFrame?.y || 0),
      parentId: parent?.id,
      slot,
      interaction:
        raw.interaction || raw.role || parentFrame?.interaction || "",
      visible: Boolean(p.visible) && (parentFrame?.visible ?? true),
      enabled: Boolean(p.enabled) && (parentFrame?.enabled ?? true),
      alpha: p.opacity * (parentFrame?.alpha ?? 1),
      blend: p.blendMode,
      hasFill:
        type !== "glass" &&
        (Boolean(property(node, "background")) ||
          hasFillGradient ||
          ["rect", "rectangle", "button", "container", "solid"].includes(type)),
      active: !options.host || hostSlotActive(slot, options.hostState),
    };
    frames.set(node.id, frame);
  }
  // SceneNode anchors each title primitive to the bottom edge when the host
  // expands upward. Keep authored world coordinates intact for source edits.
  const layers = new Map();
  if (options.host)
    for (const f of frames.values())
      if (f.active)
        layers.set(
          f.component.id,
          Math.max(layers.get(f.component.id) || 0, hostLayer(f.slot)),
        );
  for (const frame of frames.values()) {
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
  return { runtime, frames };
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
