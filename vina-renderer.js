import { block, parsePoints, pathData, colorHex } from "./vina-core.js";
import { gradientValue } from "./vina-preview.js";
import { resolveScene } from "./vina-scene.js";
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attributes = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [key, v] of Object.entries(attributes))
    n.setAttribute(key, String(v));
  return n;
};
const cssColor = (n, fallback = "#000000") => {
  try {
    return colorHex(n);
  } catch {
    return fallback;
  }
};
export function renderScene(doc, inputs, options = {}) {
  const { runtime, frames } = resolveScene(doc, inputs, options),
    fragment = document.createDocumentFragment(),
    nodes = new Map();
  let gradientSeq = 0;
  const gradient = (defs, node, destination, p, path, w, h) => {
    const grad = block(node, destination);
    if (!grad) return null;
    const gp = path + "." + destination,
      hp = path + ".hover." + destination,
      amount = options.hover?.get(node.id) || 0,
      get = (k, d) => gradientValue(runtime, gp, hp, k, d, amount);
    if (!get("enabled", true)) return null;
    const id = "grad" + ++gradientSeq,
      radial = get("type", "linear") === "radial";
    const n = radial
      ? svg("radialGradient", {
          id,
          cx: 0,
          cy: 0,
          r: 1,
          gradientUnits: "userSpaceOnUse",
          gradientTransform: `translate(${get("centerX", 0.5) * w}, ${get("centerY", 0.5) * h}) scale(${get("radiusX", 0.5) * w}, ${get("radiusY", 0.5) * h})`,
        })
      : svg("linearGradient", {
          id,
          x1: get("startX", 0) * w,
          y1: get("startY", 0) * h,
          x2: get("endX", 1) * w,
          y2: get("endY", 0) * h,
          gradientUnits: "userSpaceOnUse",
        });
    for (const stop of block(grad, "stops")?.members || []) {
      const sp = gp + ".stops." + stop.name;
      const hotStop = hp + ".stops." + stop.name;
      n.append(
        svg("stop", {
          offset: gradientValue(runtime, sp, hotStop, "position", 0, amount),
          "stop-color": cssColor(
            gradientValue(runtime, sp, hotStop, "color", 0, amount),
          ),
          "stop-opacity": gradientValue(
            runtime,
            sp,
            hotStop,
            "opacity",
            1,
            amount,
          ),
        }),
      );
    }
    defs.append(n);
    return `url(#${id})`;
  };
  for (const frame of frames.values()) {
    const { node, parent, component, path, p, w, h } = frame,
      type = p.type,
      parentFrame = parent ? frames.get(parent.id) : null;
    const x = frame.paintX - (parentFrame?.paintX || 0),
      y = frame.paintY - (parentFrame?.paintY || 0);
    const editable = options.editable?.has(node.id) ?? true;
    if (!editable && !options.showBase && !parentFrame?.rendered) {
      continue;
    }
    frame.rendered = true;
    const el = document.createElement("div");
    el.className = "el";
    el.dataset.id = node.id;
    el.dataset.path = path;
    el.dataset.type = type;
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${frame.stackZ};`;
    el.classList.toggle(
      "selected",
      !options.running && options.selection?.includes(node.id),
    );
    el.classList.toggle("locked", options.locks?.includes(node.id));
    if (!editable) el.classList.add("inherited");
    if (!frame.visible) el.style.visibility = "hidden";
    if (
      !frame.active ||
      (options.running && !frame.enabled) ||
      (type === "group" && !frame.hasFill && !p.action && !p.toggle)
    )
      el.style.pointerEvents = "none";
    const body = document.createElement("div");
    body.className = "el-body";
    body.style.overflow = "visible";
    body.style.borderRadius = (p.radius || 0) + "px";
    // Native ViewTree multiplies opacity into each paint primitive; applying
    // opacity to the DOM group would composite overlapping children differently.
    body.style.opacity = String(frame.alpha);
    frame.paintVisible =
      frame.visible && frame.active && w > 0 && h > 0 && frame.alpha > 0.001;
    if (!frame.paintVisible) body.style.display = "none";
    el.append(body);
    const surface = svg("svg", {
      width: "100%",
      height: "100%",
      viewBox: `0 0 ${Math.max(w, 0.001)} ${Math.max(h, 0.001)}`,
      preserveAspectRatio: "none",
    });
    surface.classList.add("surface");
    surface.style.overflow = "visible";
    const defs = svg("defs");
    surface.append(defs);
    const fillGrad = gradient(defs, node, "backgroundGradient", p, path, w, h),
      borderGrad = gradient(defs, node, "borderGradient", p, path, w, h);
    const hasFill = frame.hasFill;
    const fill = hasFill
      ? fillGrad || cssColor(p.background ?? inputs["pogget.theme.midnight"])
      : "none";
    const stroke =
        borderGrad ||
        cssColor(p.borderColor ?? inputs["pogget.theme.white"], "#ffffff"),
      strokeWidth = p.border ?? (type === "path" ? 1 : 0);
    let shape;
    if (type === "path") {
      const points = parsePoints(p.points, p.closed ?? true).map((pt) => ({
        x: (pt.x / (p.pathWidth || 100)) * w,
        y: (pt.y / (p.pathHeight || 100)) * h,
      }));
      shape = svg("path", {
        d: pathData(
          points,
          p.closed ?? true,
          p.smooth ?? false,
          p.tension ?? 0.25,
        ),
      });
    } else
      shape = svg("rect", {
        x: 0,
        y: 0,
        width: w,
        height: h,
        rx: type === "solid" ? 0 : p.radius,
      });
    shape.setAttribute("fill", p.borderOnly ? "none" : fill);
    shape.setAttribute("fill-opacity", String(p.fillOpacity ?? 1));
    shape.setAttribute("stroke", stroke);
    shape.setAttribute("stroke-width", strokeWidth);
    shape.setAttribute("stroke-opacity", String(p.borderOpacity ?? 1));
    if (type !== "path") shape.setAttribute("paint-order", "stroke fill");
    if (p.borderStyle === "dash")
      shape.setAttribute(
        "stroke-dasharray",
        `${strokeWidth * 3} ${strokeWidth * 2}`,
      );
    if (p.shadowOpacity > 0) {
      // VertexUI's quick shadow is a fixed stack of expanded rounded rects,
      // not a Gaussian blur/drop-shadow. Keep its +3 DIP vertical offset.
      const quality = p.shadowQuality ?? 4;
      for (let i = 0; i < quality; i++) {
        const progress = Math.fround(i / quality),
          blur = Math.fround((p.shadowBlur ?? 16) * progress);
        surface.append(
          svg("rect", {
            x: (p.shadowX || 0) - blur,
            y: (p.shadowY ?? 4) - blur + 3,
            width: w + blur * 2,
            height: h + blur * 2,
            rx: p.radius + blur,
            fill: cssColor(p.shadowColor),
            "fill-opacity": p.shadowOpacity * (1 - progress),
            class: "native-shadow",
          }),
        );
      }
    }
    if (type !== "glass") {
      const textured =
        type !== "path" && p.texture !== false && p.texture != null && hasFill;
      if (textured) {
        // Native texture is a three-level bevel, not a noise/stripe overlay.
        const fade = (amount) => {
          const color = p.background,
            channels = [0, 8, 16].map((shift) => (color >> shift) & 255),
            delta =
              channels.reduce((sum, c) => sum + c, 0) / 3 > 128
                ? -amount
                : amount;
          return cssColor(
            channels.reduce(
              (sum, c, i) =>
                sum | (Math.max(0, Math.min(255, c + delta)) << (i * 8)),
              0,
            ),
          );
        };
        shape.setAttribute("fill", fade(10));
        shape.setAttribute("stroke", fade(25));
        shape.setAttribute("stroke-width", p.texture);
        surface.append(shape);
        for (const [inset, amount] of [
          [1, 5],
          [2, 0],
        ]) {
          if (h <= inset) continue;
          surface.append(
            svg("rect", {
              x: 0,
              y: 0,
              width: w,
              height: h - inset,
              rx: p.radius,
              fill: fade(amount),
              "fill-opacity": p.fillOpacity,
            }),
          );
        }
        if (strokeWidth > 0)
          surface.append(
            svg("rect", {
              x: 0,
              y: 0,
              width: w,
              height: h,
              rx: p.radius,
              fill: "none",
              stroke,
              "stroke-width": strokeWidth,
              "stroke-opacity": p.borderOpacity,
              ...(p.borderDashed
                ? {
                    "stroke-dasharray": `${strokeWidth * 2} ${strokeWidth * 2}`,
                  }
                : {}),
            }),
          );
      } else surface.append(shape);
    }
    body.append(surface);
    if (p.innerShadowOpacity > 0)
      body.style.boxShadow = `inset 0 ${p.innerShadowInset ?? 1}px ${p.innerShadowDepth ?? 5}px rgba(0,0,0,${p.innerShadowOpacity})`;
    if (p.blur > 0) body.style.backdropFilter = `blur(${p.blur}px)`;
    if (frame.blend !== "normal")
      body.style.mixBlendMode =
        frame.blend === "linearDodge" ? "plus-lighter" : "multiply";
    if (type === "glass") {
      body.classList.add("glass-preview");
      body.style.background = `color-mix(in srgb, ${cssColor(p.background ?? 0x372820)} ${(p.glassOpacity ?? 1) * 18}%, transparent)`;
      body.style.border = `${p.glassBorder ?? 1}px solid color-mix(in srgb, ${stroke} 42%, transparent)`;
      if (p.glassRenderer === "lightEffect") body.classList.add("light-effect");
    }
    if (p.icon != null || p.label != null || p.text != null) {
      const text = document.createElement("div");
      text.className = "paint-text";
      text.textContent = p.icon || p.label || p.text || "";
      text.style.color = cssColor(
        p.color ?? inputs["pogget.theme.white"],
        "#ffffff",
      );
      text.style.fontSize = (p.textSize ?? 14) + "px";
      text.style.fontFamily = JSON.stringify(p.font || "Segoe UI");
      text.style.fontWeight = p.emphasized ? "600" : "400";
      text.style.alignItems = "flex-start";
      text.style.lineHeight = "normal";
      text.style.justifyContent =
        p.textRenderer === "glyph" || p.align === "left"
          ? "flex-start"
          : p.align === "right"
            ? "flex-end"
            : "center";
      text.style.left = p.textX + "px";
      text.style.top = p.textY + "px";
      text.style.right = "auto";
      text.style.bottom = "auto";
      text.style.width = w + "px";
      text.style.height = h + "px";
      text.style.overflow = p.textClip ? "hidden" : "visible";
      text.style.whiteSpace = p.textNoWrap ? "nowrap" : "pre-wrap";
      if (p.textShadowOpacity > 0)
        text.style.textShadow = `${p.textShadowX || 0}px ${p.textShadowY ?? 1}px ${p.textShadowBlur ?? 2}px ${cssColor(p.textShadowColor)}`;
      if (p.textShadowOnly) text.style.color = "transparent";
      body.append(text);
    }
    if (type === "image") {
      const source = p.source || p.src || "";
      if (
        /^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,|blob:)/i.test(
          source,
        ) &&
        p.imageRenderer !== "resource" &&
        p.imageRenderer !== "shell"
      ) {
        const img = document.createElement("img");
        img.src = source;
        img.referrerPolicy = "no-referrer";
        img.draggable = false;
        img.style.objectFit = p.imageFit === "contain" ? "contain" : "fill";
        img.style.borderRadius = (p.radius || 0) + "px";
        body.append(img);
      } else {
        const hint = document.createElement("span");
        hint.className = "resource-hint";
        hint.textContent = "▣ " + (source || "图片资源");
        body.append(hint);
      }
    }
    if (type === "content" || type.startsWith("pogget.native.")) {
      body.classList.add("native-preview");
      const hint = document.createElement("span");
      hint.className = "resource-hint";
      hint.textContent =
        type === "content"
          ? "应用内容 · " + (p.source || "未指定来源")
          : type.split(".").at(-1);
      body.append(hint);
    }
    const container = document.createElement("div");
    container.className = "el-children";
    if (p.clip) {
      container.style.overflow = "hidden";
      container.style.borderRadius = p.clipRadius + "px";
    }
    el.append(container);
    el._children = container;
    if (parent && nodes.has(parent.id))
      nodes.get(parent.id)._children.append(el);
    else fragment.append(el);
    nodes.set(node.id, el);
    if (options.running && block(node, "hover")) {
      el.addEventListener("pointerenter", (event) => {
        event.stopPropagation();
        options.onHover?.(node, true);
      });
      el.addEventListener("pointerleave", (event) => {
        event.stopPropagation();
        options.onHover?.(node, false);
      });
    }
  }
  return { fragment, nodes, frames, runtime };
}
