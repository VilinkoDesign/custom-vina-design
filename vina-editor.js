import { viewNodes, property, block, META } from "./vina-core.js";

// Source order is native back-to-front. The tree presents siblings in the
// opposite order, preserving their hierarchy and actual z stacking.
export function orderedLayers(doc, frames, frontFirst = true) {
  const buckets = new Map();
  for (const entry of viewNodes(doc)) {
    const parent = entry.parent?.id || null;
    if (!buckets.has(parent)) buckets.set(parent, []);
    buckets.get(parent).push(entry);
  }
  const result = [];
  function visit(parent) {
    const siblings = buckets.get(parent) || [];
    const ordered = siblings
      .map((entry, index) => ({ entry, index }))
      .sort(
        (a, b) =>
          (frames.get(a.entry.node.id)?.stackZ || 0) -
            (frames.get(b.entry.node.id)?.stackZ || 0) || a.index - b.index,
      );
    if (frontFirst) ordered.reverse();
    for (const { entry } of ordered) {
      result.push(entry);
      visit(entry.node.id);
    }
  }
  visit(null);
  return result;
}

export function numberStep(key = "", value = 0) {
  if (
    /^(z|shadowQuality|TitleType|TagStyle)$|(?:Index|Count|Quality)$/.test(key)
  )
    return 1;
  if (
    /opacity|alpha|tension|amount|scale|progress|duration|transition|delay/i.test(
      key,
    )
  )
    return 0.01;
  const decimals = String(value).split(".")[1]?.length || 0;
  return decimals > 1 ? 0.01 : 0.1;
}

export function stepNumber(
  value,
  step,
  direction,
  min = -Infinity,
  max = Infinity,
) {
  return Math.max(
    min,
    Math.min(max, Number((Number(value) + step * direction).toFixed(10))),
  );
}

export function resizeCorner(frame, corner, dx, dy, aspect = false) {
  const west = corner.includes("w"),
    north = corner.includes("n");
  let dw = (west ? -1 : 1) * dx,
    dh = (north ? -1 : 1) * dy;
  if (aspect && frame.w > 0 && frame.h > 0) {
    const scale = Math.max(
      -1,
      Math.abs(dw / frame.w) >= Math.abs(dh / frame.h)
        ? dw / frame.w
        : dh / frame.h,
    );
    dw = frame.w * scale;
    dh = frame.h * scale;
  }
  const w = Math.max(0, frame.w + dw),
    h = Math.max(0, frame.h + dh);
  return { w, h, x: west ? frame.w - w : 0, y: north ? frame.h - h : 0 };
}

export function propertyGroups(node, p) {
  const type = p.type || "rect",
    declared = (key) => Boolean(property(node, key));
  const rounded = [
    "rect",
    "rectangle",
    "button",
    "container",
    "group",
  ].includes(type);
  const text =
    ["text", "icon", "button"].includes(type) ||
    declared("label") ||
    declared("icon");
  const groups = [];
  const surface =
    rounded || type === "path" || type === "solid" || declared("background");
  if (surface)
    groups.push({
      title: "外观",
      keys: [
        "background",
        "fillOpacity",
        ...(type === "solid"
          ? []
          : [
              ...(type === "path" ? [] : ["radius"]),
              "border",
              "borderColor",
              "borderOpacity",
              "borderStyle",
              "borderOnly",
            ]),
        "blendMode",
        ...(rounded ? ["texture", "blur", "blurRenderer"] : []),
      ],
      gradients: type !== "solid",
      collapsed:
        type === "group" && !declared("background") && !declared("border"),
    });
  else
    groups.push({
      title: "外观",
      keys: [
        ...(type === "glass" || type === "image" ? ["radius"] : []),
        "blendMode",
      ],
    });
  if (text)
    groups.push({
      title: "文字与图标",
      keys: [
        type === "icon" || declared("icon") ? "icon" : "label",
        "textLiteral",
        "textSize",
        "color",
        "font",
        "align",
        "textX",
        "textY",
        "textRenderer",
        "textNoWrap",
      ],
    });
  if (
    type === "group" ||
    node.members.some((m) => m.kind === "block" && !META.has(m.name))
  )
    groups.push({
      title: "分组与裁剪",
      keys: [
        "clip",
        ...(p.clip ? ["clipRadius", "clipLayer", "clipAntialias"] : []),
      ],
    });
  if (type === "path")
    groups.push({
      title: "路径编辑",
      keys: [
        "points",
        "pathWidth",
        "pathHeight",
        "closed",
        "smooth",
        ...(p.smooth ? ["tension"] : []),
      ],
    });
  if (type === "image" || type === "content")
    groups.push({
      title: "资源",
      keys:
        type === "image"
          ? ["source", "imageRenderer", "imageFit"]
          : ["source", "contentScale"],
    });
  if (type === "glass")
    groups.push({
      title: "模糊层",
      keys: [
        "blur",
        "blurRenderer",
        "glassRenderer",
        "glassOpacity",
        "glassBorder",
        "glassActive",
        "glassTintEnabled",
        ...(p.glassTintEnabled ? ["glassTintColor", "glassTintAmount"] : []),
        "glassCustomEdge",
        ...(p.glassCustomEdge ? ["borderColor"] : []),
      ],
    });
  groups.push({
    title: "行为与动画",
    collapsed: !p.action && !p.holdAction && !p.toggle && !block(node, "hover"),
    keys: [
      "slot",
      "interaction",
      "action",
      "holdAction",
      "toggle",
      "transition",
      "unhoverTransition",
      ...(p.action || p.holdAction
        ? ["pressDuration", "releaseDuration", "pressScale"]
        : []),
      ...(p.holdAction
        ? ["holdDelay", "holdDuration", "holdScale", "holdOffset"]
        : []),
    ],
  });
  groups.push({
    title: "阴影",
    collapsed: !(p.shadowOpacity > 0),
    keys: [
      "shadowOpacity",
      "shadowColor",
      "shadowX",
      "shadowY",
      "shadowBlur",
      "shadowQuality",
    ],
  });
  return groups;
}
