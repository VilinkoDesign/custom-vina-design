import * as V from "./vina-core.js";
import { personalizationGroups, nativeLabel, sliderTitle, rgbToHsl, hslToRgb } from "./vina-personalization.js";
import { showDialog, closeDialog } from "./vina-dialog.js";

const node = (tag, className, text) => {
  const n = document.createElement(tag);
  n.className = className;
  if (text != null) n.textContent = text;
  return n;
};
const range = (label, min, max, step) => {
  const n = node("input", "personal-range");
  n.type = "range"; n.min = min; n.max = max; n.step = step;
  n.setAttribute("aria-label", label);
  let pointer = null;
  const update = event => {
    const rect = n.getBoundingClientRect(), progress = Math.max(0, Math.min(1, (event.clientX - rect.left - 6) / Math.max(1, rect.width - 12)));
    n.value = Number(n.min) + progress * (Number(n.max) - Number(n.min));
    n.dispatchEvent(new Event("input", { bubbles: true }));
  };
  n.addEventListener("pointerdown", event => {
    if (event.button !== 0 || n.disabled) return;
    event.preventDefault(); n.focus(); pointer = event.pointerId;
    n.setPointerCapture(pointer); update(event);
  });
  n.addEventListener("pointermove", event => { if (event.pointerId === pointer) update(event); });
  const release = event => {
    if (event.pointerId !== pointer) return;
    const captured = pointer; pointer = null;
    if (n.hasPointerCapture(captured)) n.releasePointerCapture(captured);
    n.dispatchEvent(new Event("change", { bubbles: true }));
  };
  n.addEventListener("pointerup", release);
  n.addEventListener("pointercancel", release);
  n.addEventListener("lostpointercapture", () => { pointer = null; });
  return n;
};

function hslEditor(field, label, change) {
  const box = node("div", "personal-hsl"), top = node("div", "personal-hsl-top"),
    swatch = node("span", "personal-swatch"), heading = node("div", "personal-hsl-heading"),
    hex = node("span", "personal-hex"), rows = [];
  heading.append(node("span", "", "HSL"), hex); top.append(swatch, heading); box.append(top);
  let hsl = rgbToHsl(Number(field.value)), color;
  const update = () => {
    const text = V.colorHex(hslToRgb(...hsl));
    swatch.style.background = text; hex.textContent = text.toUpperCase();
    rows.forEach(({ input, output }, i) => {
      input.value = hsl[i]; output.textContent = Math.round(hsl[i]) + (i ? "%" : "°");
      const gradient = i === 0 ? "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" :
        i === 1 ? `linear-gradient(to right,hsl(${hsl[0]} 0% ${hsl[2]}%),hsl(${hsl[0]} 100% ${hsl[2]}%))` :
        `linear-gradient(to right,#000,hsl(${hsl[0]} ${hsl[1]}% 50%),#fff)`;
      input.style.setProperty("--rail", gradient);
      input.style.setProperty("--thumb", text);
    });
  };
  ["hslHue", "hslSaturation", "hslLightness"].forEach((key, i) => {
    const row = node("div", "personal-hsl-row"), caption = node("div", "personal-hsl-caption"),
      output = node("output", ""), input = range(field.valuePath + "." + "HSL"[i], 0, i ? 100 : 360, "any");
    caption.append(node("span", "", label(key)), output); row.append(caption, input); box.append(row);
    input.addEventListener("input", () => {
      hsl[i] = Number(input.value);
      const next = hslToRgb(...hsl);
      const previous = color;
      color = next;
      if (!change(next)) color = previous;
      update();
    });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault(); rows[(i + (event.key === "ArrowDown" ? 1 : 2)) % 3].input.focus();
      } else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        input.value = Math.max(0, Math.min(i ? 100 : 360, hsl[i] + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1)));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    rows.push({ input, output });
  });
  return { element: box, sync(value) {
    if (value !== color) {
      const next = rgbToHsl(Number(value));
      // Preserve hue through greys, and sub-byte rail precision through host redraws.
      if (color === undefined || next[1] > 0.001) hsl[0] = next[0];
      hsl[1] = next[1]; hsl[2] = next[2]; color = value;
    }
    update();
  } };
}

function chooseFont(value, label, commit) {
  const dialog = node("dialog", "personal-font-dialog"), head = node("div", "dialog-head"),
    body = node("div", "dialog-body"), foot = node("div", "dialog-foot"),
    input = node("input", "ctl"), list = node("select", "personal-font-list"),
    preview = node("p", "personal-font-preview", "Pogget · 中文预览 Aa 123");
  head.append(node("h2", "", label("fontSelectionTitle")));
  input.value = value; input.setAttribute("aria-label", "字体名称");
  list.size = 7; list.setAttribute("aria-label", "字体列表");
  for (const font of [...new Set([value, "Segoe UI", "Microsoft YaHei", "Microsoft JhengHei", "SimSun", "Arial", "Consolas", "Georgia", "Times New Roman"])].filter(Boolean)) {
    const option = node("option", "", font); option.value = font; option.style.fontFamily = font; list.append(option);
  }
  const update = () => { preview.style.fontFamily = input.value; };
  list.value = value;
  list.addEventListener("change", () => { input.value = list.value; update(); });
  input.addEventListener("input", update);
  const cancel = node("button", "btn-ghost", "取消"), apply = node("button", "btn-primary", "应用");
  cancel.type = apply.type = "button";
  cancel.addEventListener("click", () => closeDialog(dialog));
  const accept = () => { if (input.value.trim()) { commit(input.value.trim()); closeDialog(dialog); } };
  apply.addEventListener("click", accept);
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); accept(); } });
  dialog.addEventListener("cancel", e => { e.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener("keydown", e => e.stopPropagation());
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  body.append(input, list, preview); foot.append(cancel, apply); dialog.append(head, body, foot);
  document.body.append(dialog); update(); showDialog(dialog); input.focus();
}

export function mountPersonalization(target, { read, change, action, commit = () => {}, editable = () => true, filterGroup = () => true, mode = "preview", catalog, language = "zh-CN", expanded = new Map(), query = { value: "" } }) {
  const label = key => nativeLabel("pogget.label." + key, catalog, language),
    panel = node("div", "personalization-panel"), search = node("input", "ctl personal-search"),
    list = node("div", "personal-groups"), empty = node("p", "panel-hint", "没有匹配的设置"), views = [];
  search.type = "search"; search.placeholder = label("settingsSearchPlaceholder");
  if (search.placeholder.startsWith("pogget.label.")) search.placeholder = "搜索设置";
  search.setAttribute("aria-label", "搜索个性化设置");
  search.value = query.value;
  panel.append(search, list, empty); target.append(panel);
  const initial = read(), rt = new V.Runtime(initial.doc, initial.inputs);
  const metric = (name, fallback) => Number(rt.get("Panel." + name, fallback));
  for (const [name, fallback] of Object.entries({ header: 52, gap: 12, padding: 16, bodyTop: 14, bodyBottom: 16, editorHeight: 200, optionHeight: 36, labelSize: 12, optionSize: 14, optionGap: 65, sliderGap: 50, toggleGap: 40 }))
    panel.style.setProperty("--personal-" + name, metric(name, fallback) + "px");
  for (const [name, path, fallback] of [["bg", "Panel.background", initial.inputs["pogget.theme.darknight"] ?? 0xffffff], ["group", "Panel.groupBackground", initial.inputs["pogget.theme.midnight"] ?? 0xf5f5f5], ["ink", "pogget.theme.white", 0x141414]])
    panel.style.setProperty("--personal-" + name, V.colorHex(rt.get(path, fallback)));
  let searching = false, snapshot = initial;
  const currentGroups = () => {
    snapshot = read();
    const { doc, inputs } = snapshot;
    return personalizationGroups(doc, inputs, catalog, language);
  };
  for (const group of currentGroups().filter(filterGroup)) {
    const details = node("details", "personal-group"), summary = node("summary", "personal-group-header"),
      glyph = node("span", "personal-group-icon", group.icon), text = node("span", "personal-group-text"),
      title = node("span", "personal-group-title", group.title), description = node("span", "personal-group-description", group.description),
      chevron = node("span", "personal-group-chevron", "\uf054"), body = node("div", "personal-group-body");
    details.dataset.group = group.path; details.open = expanded.get(group.path) || false;
    details.classList.toggle("personal-no-description", !group.description);
    text.append(title, description); summary.append(glyph, text, chevron); details.append(summary, body); list.append(details);
    details.addEventListener("toggle", () => { if (!searching) expanded.set(group.path, details.open); });
    const controls = new Map();
    for (const field of group.fields) {
      const row = node("div", "personal-field"), caption = node("label", "personal-field-label", field.label),
        notice = node("div", "personal-notice", field.notice);
      row.dataset.variable = field.valuePath; row.dataset.control = field.kind;
      row.append(caption); body.append(row);
      const canEdit = editable(field);
      const apply = value => {
        if (!canEdit) return false;
        const ok = change(field.valuePath, value, field);
        refresh(); return ok;
      };
      let sync, control;
      if (["slider", "number"].includes(field.kind)) {
        const line = node("div", "personal-slider-caption"), output = node("output", "personal-slider-value");
        control = range(field.valuePath, 0, 100, "any");
        line.append(caption, output); row.replaceChildren(line, control);
        control.addEventListener("input", () => {
          const value = field.min + Number(control.value) * (field.max - field.min) / 100;
          apply(field.min + Math.round((value - field.min) / field.step) * field.step);
        });
        control.addEventListener("change", commit);
        sync = f => {
          const percent = f.max > f.min ? (Number(f.value) - f.min) * 100 / (f.max - f.min) : 0;
          caption.textContent = sliderTitle(f, catalog, language);
          control.value = percent; control.style.setProperty("--progress", percent + "%");
          control.setAttribute("aria-valuetext", String(f.value));
          output.textContent = Math.trunc(percent) + "%";
          output.hidden = /:|%|px/.test(caption.textContent);
        };
      } else if (["switch", "toggle"].includes(field.kind)) {
        control = node("button", "personal-switch"); control.type = "button"; control.setAttribute("role", "switch");
        row.classList.add("personal-toggle-row"); row.prepend(control);
        control.addEventListener("click", () => { if (apply(control.getAttribute("aria-checked") !== "true")) commit(); });
        sync = f => control.setAttribute("aria-checked", String(Boolean(f.value)));
      } else if (field.kind === "color") {
        const editor = hslEditor(field, label, apply);
        control = editor.element;
        const bound = ["BackgroundColor", "BorderColor", "TitleBarColor"].includes(field.bind),
          sourceKey = field.bind === "TitleBarColor" ? "pogget.ui.TitleBarColorSource" : field.bind === "BorderColor" ? "pogget.ui.CustomBorderColor" : "pogget.ui.CustomBackgroundColor";
        let tabs;
        if (bound) {
          tabs = node("div", "personal-color-sources"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", field.label + "来源");
          const names = field.bind === "TitleBarColor" ? ["colorSourceTheme", "colorSourceTag", "colorSourceCustom"] : ["colorSourceTheme", "colorSourceCustom"];
          names.forEach((name, i) => {
            const tab = node("button", "", label(name)); tab.type = "button";
            tab.addEventListener("click", () => { if (canEdit) { change(sourceKey, i); commit(); refresh(); } }); tabs.append(tab);
          });
          row.append(tabs);
        }
        row.append(control);
        sync = f => {
          const source = snapshot.inputs[sourceKey] ?? 0;
          if (tabs) [...tabs.children].forEach((tab, i) => tab.setAttribute("aria-pressed", String(source === i)));
          control.hidden = bound && source !== tabs.children.length - 1;
          editor.sync(f.value);
        };
        control.addEventListener("change", commit);
      } else if (field.kind === "font") {
        control = node("button", "personal-option"); control.type = "button";
        control.addEventListener("click", () => chooseFont(field.value, label, value => { const ok = apply(value); if (ok) commit(); }));
        sync = f => { control.textContent = String(f.value); };
      } else if (["text", "edit"].includes(field.kind)) {
        control = node("input", "personal-option personal-text"); control.type = "text";
        control.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); if (apply(control.value)) commit(); } });
        control.addEventListener("change", () => { if (apply(control.value)) commit(); });
        sync = f => { if (document.activeElement !== control) control.value = f.value; };
      } else if (field.choices.length) {
        control = node("select", "personal-option");
        field.choices.forEach((text, i) => { const option = node("option", "", text); option.value = i; control.append(option); });
        control.addEventListener("change", () => { if (apply(field.invert ? 1 - Number(control.value) : Number(control.value))) commit(); });
        sync = f => {
          const selected = f.type === "boolean" ? (f.value ? 1 : 0) : Number(f.value);
          control.value = Math.max(0, Math.min(f.choices.length - 1, f.invert ? 1 - selected : selected));
          [...control.options].forEach((o, i) => { o.textContent = f.choices[i]; o.hidden = f.bind === "TransparentFrameMode" && snapshot.inputs["pogget.mode"] === 4 && i === 2; });
        };
      } else {
        control = node("button", "personal-option", field.label); control.type = "button";
        control.addEventListener("click", () => { action(field.action); refresh(); }); sync = () => {};
      }
      if (field.kind !== "color" && !control.parentNode) row.append(control);
      if (!canEdit && field.kind !== "button") {
        control.disabled = true;
        control.querySelectorAll?.("input,button,select").forEach((input) => { input.disabled = true; });
        row.classList.add("personal-readonly");
      }
      control.setAttribute("aria-label", field.valuePath);
      const id = "personal-" + field.path.replace(/\./g, "-"); control.id = id; caption.htmlFor = id;
      if (field.notice) row.append(notice);
      controls.set(field.path, { row, caption, notice, sync, field });
    }
    views.push({ path: group.path, details, title, description, controls });
  }
  function refresh() {
    query.value = search.value;
    const terms = search.value.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
    const wasSearching = searching; searching = terms.length > 0;
    let count = 0;
    for (const group of currentGroups().filter(filterGroup)) {
      const view = views.find(v => v.path === group.path); if (!view) continue;
      let visible = 0;
      for (const field of group.fields) {
        const ctl = view.controls.get(field.path); if (!ctl) continue;
        Object.assign(ctl.field, field);
        const text = [field.label, field.notice, ...field.choices].join(" ").normalize("NFKC").toLowerCase();
        ctl.row.hidden = !field.visible || !terms.every(term => text.includes(term));
        if (!ctl.row.hidden) visible++;
        ctl.caption.textContent = field.label; ctl.notice.textContent = field.notice; ctl.sync(field);
      }
      view.details.hidden = !visible;
      if (searching) view.details.open = true;
      else if (wasSearching) view.details.open = expanded.get(group.path) || false;
      count += visible;
    }
    empty.hidden = count > 0;
  }
  search.addEventListener("input", refresh);
  refresh();
  panel.dataset.mode = mode;
  return { refresh };
}
