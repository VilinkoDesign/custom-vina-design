import { orderedLayers } from "./vina-editor.js";
import { hitFrame } from "./vina-preview.js";

export function visibleObject(frame) {
  return Boolean(
    frame?.rendered &&
    frame.visible &&
    frame.active &&
    frame.alpha > 0.001 &&
    frame.p.type !== "group" &&
    frame.w > 0 &&
    frame.h > 0,
  );
}

function withinClips(scene, frame, point) {
  for (let f = frame; f; f = scene.frames.get(f.parentId)) {
    if (!f.p.clip) continue;
    const x = point.x - f.paintX,
      y = point.y - f.paintY;
    if (x < 0 || y < 0 || x > f.w || y > f.h) return false;
    const r = Math.max(0, Math.min(f.p.clipRadius || 0, f.w / 2, f.h / 2));
    const cx = Math.max(r, Math.min(f.w - r, x)),
      cy = Math.max(r, Math.min(f.h - r, y));
    if (Math.hypot(x - cx, y - cy) > r) return false;
  }
  return true;
}

function visiblePaint(shape, attribute) {
  const value = shape.getAttribute(attribute);
  if (!value || value === "none") return false;
  const gradient = /^url\(#([^)]+)\)$/.exec(value);
  if (!gradient) return true;
  const stops =
    shape.ownerSVGElement
      .querySelector(`#${CSS.escape(gradient[1])}`)
      ?.querySelectorAll("stop") || [];
  return [...stops].some(
    (stop) => Number(stop.getAttribute("stop-opacity") ?? 1) > 0.001,
  );
}

export function hasVisiblePaint(scene, frame) {
  if (!visibleObject(frame)) return false;
  const body = scene.nodes
    .get(frame.node.id)
    ?.querySelector(":scope > .el-body");
  if (!body || body.style.display === "none") return false;
  for (const shape of body.querySelectorAll(
    ":scope > .surface > rect, :scope > .surface > path",
  )) {
    if (shape.classList.contains("native-shadow")) continue;
    if (
      visiblePaint(shape, "fill") &&
      Number(shape.getAttribute("fill-opacity") ?? 1) > 0.001
    )
      return true;
    if (
      visiblePaint(shape, "stroke") &&
      Number(shape.getAttribute("stroke-width") ?? 1) > 0 &&
      Number(shape.getAttribute("stroke-opacity") ?? 1) > 0.001
    )
      return true;
  }
  return Boolean(
    body.querySelector("img,.resource-hint") ||
    (body.querySelector(":scope > .paint-text")?.textContent.trim() &&
      !frame.p.textShadowOnly) ||
    (frame.p.type === "glass" && (frame.p.glassOpacity ?? 0.8) > 0.001),
  );
}

export function hitPaint(scene, frame, point, client) {
  if (!visibleObject(frame) || !withinClips(scene, frame, point)) return false;
  const element = scene.nodes.get(frame.node.id),
    body = element?.querySelector(":scope > .el-body");
  if (!body || body.style.display === "none") return false;
  const local = new DOMPoint(point.x - frame.paintX, point.y - frame.paintY);
  for (const shape of body.querySelectorAll(
    ":scope > .surface > rect, :scope > .surface > path",
  )) {
    if (shape.classList.contains("native-shadow")) continue;
    if (
      visiblePaint(shape, "fill") &&
      Number(shape.getAttribute("fill-opacity") ?? 1) > 0.001 &&
      shape.isPointInFill(local)
    )
      return true;
    if (
      visiblePaint(shape, "stroke") &&
      Number(shape.getAttribute("stroke-width") ?? 1) > 0 &&
      Number(shape.getAttribute("stroke-opacity") ?? 1) > 0.001 &&
      shape.isPointInStroke(local)
    )
      return true;
  }
  const contains = (rect) =>
    client.x >= rect.left &&
    client.x <= rect.right &&
    client.y >= rect.top &&
    client.y <= rect.bottom;
  const text = body.querySelector(":scope > .paint-text");
  if (text?.textContent && !frame.p.textShadowOnly) {
    const range = document.createRange();
    range.selectNodeContents(text);
    if ([...range.getClientRects()].some(contains)) return true;
  }
  if (
    body.querySelector("img,.resource-hint") ||
    (frame.p.type === "glass" && (frame.p.glassOpacity ?? 0.8) > 0.001)
  )
    return contains(element.getBoundingClientRect());
  return false;
}

export function pickScene(scene, point, client, running = false) {
  if (!scene) return null;
  const order = orderedLayers(scene.runtime.doc, scene.frames, false);
  for (const { node } of order.reverse()) {
    const f = scene.frames.get(node.id);
    if (!f) continue;
    if (
      running &&
      (f.p.action || f.p.holdAction || f.p.toggle) &&
      f.rendered &&
      hitFrame(scene, node.id, point)
    )
      return f;
    if (!hitPaint(scene, f, point, client)) continue;
    if (!running) return f;
    for (let parent = f; parent; parent = scene.frames.get(parent.parentId))
      if (
        (parent.p.action || parent.p.holdAction || parent.p.toggle) &&
        hitFrame(scene, parent.node.id, point)
      )
        return parent;
    return null;
  }
  return null;
}
