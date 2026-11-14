import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as V from "../vina-core.js";
import * as M from "../vina-model.js";
import { personalizationGroups, nativeLabel, normalizeUiValue, rgbToHsl, hslToRgb, personalizationInputs } from "../vina-personalization.js";
import { personalizationSource } from "./fixtures/personalization.mjs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8"),
  standard = V.parse(read("../data/Pogget_Std.vina")),
  defaults = JSON.parse(read("../data/preview-inputs.json")),
  catalog = JSON.parse(read("../data/pogget-labels.json")),
  project = { ...V.createProject(), doc: V.parse(personalizationSource) };

test("native UI descriptors preserve source order, internal text, choice blocks, defaults and conditional visibility", () => {
  const doc = M.effectiveProject(project, standard), groups = personalizationGroups(doc, defaults, catalog), custom = groups.at(-1);
  assert.equal(groups.length, 5); assert.equal(groups[0].title, "背景");
  assert.equal(groups[0].fields[0].choices[0], "默认");
  assert.match(custom.description, /Long descriptions/);
  const color = custom.fields.find(f => f.kind === "color");
  assert.equal(color.max, 0xffffff); assert.equal(color.value, 90 | (140 << 8) | (200 << 16));
  const hidden = personalizationGroups(doc, { ...defaults, "Custom.ui.Enabled.value": false }, catalog).at(-1);
  assert.equal(hidden.fields.find(f => f.kind === "color").visible, false);
  assert.equal(normalizeUiValue(color, color.value), color.value);
  assert.equal(normalizeUiValue(color, -10), 0); assert.equal(normalizeUiValue(color, 0x1000000), 0xffffff);
  assert.throws(() => normalizeUiValue(color, NaN));
  assert.equal(nativeLabel("pogget.label.bgSectionTitle", catalog, "en-US"), catalog["en-US"].bgSectionTitle);
  assert.equal(nativeLabel("pogget.label.bgSectionTitle", catalog, "zh-TW"), catalog["zh-TW"].bgSectionTitle);
  assert.equal(nativeLabel("literal text", catalog), "literal text");
});
test("HSL endpoints and all RGB channels round-trip without changing COLORREF order", () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const color = r | (g << 8) | (b << 16);
    assert.equal(hslToRgb(...rgbToHsl(color)), color);
  }
  assert.equal(hslToRgb(0, 100, 50), 255); assert.equal(hslToRgb(360, 100, 50), 255);
  assert.equal(hslToRgb(120, 100, 50), 0xff00); assert.equal(hslToRgb(240, 100, 50), 0xff0000);
});
test("native storage bindings refresh mode, frame, source colors and visibility in the same preview", () => {
  const doc = M.effectiveProject(project, standard), inputs = personalizationInputs(doc, { ...defaults, "Background.ui.RenderStyle.value": 4, "Background.ui.WindowBorder.value": 3,
    "Background.ui.BackgroundColor.value": 123456, "pogget.ui.CustomBackgroundColor": 1 });
  assert.equal(inputs["pogget.mode"], 4); assert.equal(inputs["pogget.containerFrame.mode"], 4); assert.equal(inputs["pogget.frame"], 3);
  assert.equal(inputs["pogget.containerFrame.background"], 123456);
  assert.equal(personalizationGroups(doc, inputs, catalog)[0].fields.find(f => f.name === "ShadowBlur").visible, true);
});

test("bidirectional native/web acceptance: real C++ labels, compiler, inherited schemas, edited exports and environment visibility", {
  skip: !process.env.VINA_NATIVE_ROOT && "Set VINA_NATIVE_ROOT to the native VinaApp repository", timeout: 60000,
}, () => {
  execFileSync("cmd.exe", ["/d", "/c", "tools\\build-personalization-native.cmd"], { cwd: new URL("..", import.meta.url), windowsHide: true, stdio: "pipe" });
  const run = args => JSON.parse(execFileSync(".native-build/personalization-native.exe", args, { encoding: "utf8", windowsHide: true }));
  assert.deepEqual(run(["--labels"]), catalog, "The web catalog must exactly match actual native localization in all languages");
  mkdirSync(".native-build", { recursive: true });
  const select = groups => groups.map(g => ({ path: g.path, title: g.title, description: g.description,
    fields: g.fields.map(f => Object.fromEntries(["path", "label", "notice", "kind", "type", "bind", "visible", "value", "min", "max", "step", "invert", "choices"].map(k => [k, f[k]]))) }));
  // Native-origin source enters the web model, is edited/exported, and is
  // compiled/composed back by the real native engine, including Unicode text.
  const edited = V.clone(project), custom = edited.doc.roots.find(n => n.name === "Custom");
  V.setValue(V.block(V.block(custom, "ui"), "Color"), "default", 0x7351c8);
  V.setValue(V.block(V.block(custom, "ui"), "Text"), "default", "在线导出 → Pogget 😀");
  for (const p of [project, edited]) {
    writeFileSync(".native-build/personalization-roundtrip.vina", M.projectSource(p));
    const doc = M.effectiveProject(p, standard);
    for (const language of ["zh-CN", "zh-TW", "en-US"])
      for (const mode of [0, 3, 4]) {
        const inputs = { ...defaults, "pogget.mode": mode, "pogget.frame": 3, "Custom.ui.Enabled.value": mode !== 3, "Custom.ui.Width.value": 168 };
        writeFileSync(".native-build/personalization-inputs.json", JSON.stringify(inputs));
        const native = run([".native-build/personalization-roundtrip.vina", ".native-build/personalization-inputs.json", language, "data/Pogget_Std.vina"]);
        assert.deepEqual(native, select(personalizationGroups(doc, inputs, catalog, language)), language + " mode " + mode);
      }
  }
});
