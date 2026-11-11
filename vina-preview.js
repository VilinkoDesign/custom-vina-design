import { block, property } from "./vina-core.js";
const COLOR_KEYS = new Set([
  "background",
  "color",
  "borderColor",
  "shadowColor",
  "textShadowColor",
  "glassTintColor",
]);
export function interpolate(base, to, amount, isColor = false) {
  if (typeof base === "number" && typeof to === "number")
    return isColor
      ? [0, 8, 16].reduce(
          (sum, shift) =>
            sum |
            (Math.trunc(
              ((base >> shift) & 255) +
                (((to >> shift) & 255) - ((base >> shift) & 255)) * amount,
            ) <<
              shift),
          0,
        )
      : base + (to - base) * amount;
  return amount >= 0.5 ? to : base;
}
export function resolveHover(
  runtime,
  node,
  amount,
  defaults = {},
  bounds = {},
) {
  const p = runtime.values(node),
    hot = block(node, "hover"),
    path = runtime.idx.paths.get(node.id);
  if (!hot || amount === 0) return p;
  for (const m of hot.members.filter((n) => n.kind === "property")) {
    // Native hover changes numeric paint fields, RGB channels and blendMode.
    // It never writes the underlying Instance property or its dependents.
    if (
      !Object.hasOwn(bounds, m.name) &&
      !COLOR_KEYS.has(m.name) &&
      m.name !== "blendMode"
    )
      continue;
    const base = runtime.get(path + "." + m.name, defaults[m.name] ?? 0),
      to = runtime.get(path + ".hover." + m.name);
    p[m.name] = interpolate(base, to, amount, COLOR_KEYS.has(m.name));
  }
  return p;
}
export function gradientValue(
  runtime,
  basePath,
  hoverPath,
  key,
  fallback,
  amount,
) {
  const base = runtime.get(basePath + "." + key, fallback),
    hot = runtime.get(hoverPath + "." + key, base);
  return interpolate(base, hot, amount, key === "color");
}
export function hitFrame(scene, id, point, padding = false) {
  const f = scene?.frames.get(id);
  if (!f || f.active === false || !f.visible || !f.enabled || f.alpha <= 0.001)
    return false;
  const padX = padding ? f.p.hitPaddingX || 0 : 0,
    padY = padding ? f.p.hitPaddingY || 0 : 0;
  if (
    point.x < (f.paintX ?? f.x) - padX ||
    point.y < (f.paintY ?? f.y) - padY ||
    point.x > (f.paintX ?? f.x) + f.w + padX ||
    point.y > (f.paintY ?? f.y) + f.h + padY
  )
    return false;
  let parent = f;
  while (parent) {
    if (parent.p.clip) {
      const x = point.x - (parent.paintX ?? parent.x),
        y = point.y - (parent.paintY ?? parent.y),
        r = Math.min(
          parent.p.clipRadius ?? parent.p.radius ?? 0,
          parent.w / 2,
          parent.h / 2,
        );
      if (x < 0 || y < 0 || x > parent.w || y > parent.h) return false;
      const cx = x < r ? r : x > parent.w - r ? parent.w - r : x,
        cy = y < r ? r : y > parent.h - r ? parent.h - r : y;
      if (Math.hypot(x - cx, y - cy) > r) return false;
    }
    parent = scene.frames.get(parent.parentId);
  }
  return true;
}
