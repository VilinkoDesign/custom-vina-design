import * as V from "./vina-core.js";

export function nativeLabel(value, catalog, language = "zh-CN") {
  const text = String(value ?? "");
  if (!text.startsWith("pogget.label.")) return text;
  const lang = /^en/i.test(language) ? "en-US" : /^(zh-(TW|HK)|zh-Hant)/i.test(language) ? "zh-TW" : "zh-CN";
  return catalog?.[lang]?.[text.slice(13)] ?? text;
}
export const cleanSectionTitle = text => {
  text = String(text);
  const colon = text.lastIndexOf(":");
  return colon >= 0 && colon + 1 < text.length ? text.slice(colon + 1).replace(/^[ \t]+/, "") : text;
};

// These are the native panel defaults, independent of a field's numeric range.
export function normalizeUiValue(field, value) {
  if (field.kind === "color") {
    if (!Number.isFinite(Number(value))) throw new Error("颜色必须为 COLORREF 整数");
    return Math.round(Math.max(0, Math.min(0xffffff, Number(value))));
  }
  if (field.type === "boolean") return Boolean(value);
  if (field.type === "number") {
    if (!Number.isFinite(Number(value))) throw new Error("请输入有限数值");
    return Math.max(field.min, Math.min(field.max, Number(value)));
  }
  return String(value);
}

export function personalizationGroups(doc, inputs = {}, catalog = {}, language = "zh-CN") {
  const rt = new V.Runtime(doc, inputs),
    label = value => nativeLabel(value, catalog, language);
  return doc.roots.flatMap(root => {
    const ui = V.block(root, "ui");
    if (!ui) return [];
    return [{
      path: root.name,
      title: cleanSectionTitle(label(rt.get(root.name + ".label", root.name))),
      description: label(rt.get(root.name + ".description", "")),
      icon: String(rt.get(root.name + ".icon", "\uf013")).replace(/^:|:$/g, ""),
      fields: ui.members.filter(n => n.kind === "block").map(node => {
        const path = root.name + ".ui." + node.name,
          get = (key, fallback) => rt.get(path + "." + key, fallback),
          kind = get("control", "slider"),
          choices = V.block(node, "choices") || V.block(node, "options"),
          rawLabel = get("label", node.name),
          min = Number(get("min", 0)),
          max = Math.max(min, Number(get("max", kind === "color" ? 0xffffff : 1)));
        return {
          path, valuePath: path + ".value", name: node.name, kind,
          type: get("type", "number"), bind: get("bind", ""),
          label: label(rawLabel), rawLabel,
          notice: label(get("notice", "")),
          visible: Boolean(get("visible", true)),
          value: get("value", kind === "button" || kind === "action" ? "" : 0),
          min, max, step: Math.max(0.000001, Number(get("step", 0.01))),
          invert: Boolean(get("invert", false)), display: get("display", ""),
          action: get("action", ""),
          choices: choices ? [
            ...choices.members.filter(n => n.kind === "property").map(n => label(rt.get(path + "." + choices.name + "." + n.name))),
            ...choices.members.filter(n => n.kind === "block").map(n => label(rt.get(path + "." + choices.name + "." + n.name + ".label", n.name))),
          ] : [],
        };
      }),
    }];
  });
}

export function sliderTitle(field, catalog, language) {
  const label = key => nativeLabel("pogget.label." + key, catalog, language);
  let value = Number(field.value);
  if (String(field.rawLabel).endsWith("Prefix")) {
    if (field.bind === "shadowAlpha") value *= 100;
    return field.label + Math.trunc(value) + nativeLabel(String(field.rawLabel).slice(0, -6) + "Suffix", catalog, language);
  }
  if (field.bind === "textSize") return value === 10 ? label("textSizeDefault") : label("textSizeFormat").replace("%d", Math.round(value * 10)).replace("%%", "%");
  if (field.bind === "TextOmitOffset") return value === 0 ? label("textOmitDefault") : label("textOmitFormat").replace("%+d", (value >= 0 ? "+" : "") + Math.trunc(value));
  if (field.bind === "TitleBlurRadius") return field.label + ": " + Math.round(value);
  if (field.display === "percent") return field.label + ": " + Math.round(value * 100) + "%";
  return field.label;
}

// Reflect native storage bindings that drive conditional rows and host paint.
export function personalizationInputs(doc, inputs) {
  const result = { ...inputs }, rt = new V.Runtime(doc, inputs);
  const bindings = {
    CompatibleLayer: ["pogget.mode", "pogget.containerFrame.mode"],
    TransparentFrameMode: ["pogget.frame", "pogget.containerFrame.frame"],
    EnableStaticMaterialLayerForD3D11: ["pogget.staticMaterial"],
    TitleType: ["pogget.titleType"], TagStyle: ["pogget.tagStyle"],
    bgAlpha: ["pogget.backgroundAlpha"],
    BorderOpacity: ["pogget.containerFrame.borderOpacity"],
  };
  for (const root of doc.roots)
    for (const node of V.block(root, "ui")?.members || []) {
      if (node.kind !== "block") continue;
      const path = root.name + ".ui." + node.name,
        bind = rt.get(path + ".bind", "");
      // A preview environment override remains authoritative until this
      // particular control is changed, just like the native stored setting.
      if (Object.hasOwn(inputs, path + ".value"))
        for (const target of bindings[bind] || []) result[target] = rt.get(path + ".value");
    }
  for (const root of doc.roots)
    for (const node of V.block(root, "ui")?.members || []) {
      if (node.kind !== "block") continue;
      const path = root.name + ".ui." + node.name, bind = rt.get(path + ".bind", ""),
        value = rt.get(path + ".value", 0);
      if (bind === "BackgroundColor" && inputs["pogget.ui.CustomBackgroundColor"] === 1) result["pogget.containerFrame.background"] = value;
      if (bind === "BorderColor" && inputs["pogget.ui.CustomBorderColor"] === 1) {
        result["pogget.containerFrame.borderColor"] = value;
        result["pogget.containerFrame.customBorder"] = true;
      }
      if (bind === "TitleBarColor") {
        const source = inputs["pogget.ui.TitleBarColorSource"];
        if (source === 2) result["pogget.titleColor"] = value;
        else if (source === 1) result["pogget.titleColor"] = inputs["pogget.tag.color"];
      }
    }
  return result;
}

export function rgbToHsl(color) {
  const r = (color & 255) / 255, g = ((color >> 8) & 255) / 255, b = ((color >> 16) & 255) / 255,
    max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = (max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  }
  return [h, s * 100, l * 100];
}
export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const channels = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return channels.reduce((result, value, i) => result | (Math.round((value + m) * 255) << (8 * i)), 0);
}
