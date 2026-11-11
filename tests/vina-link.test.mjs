import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectFromLink, LINK_LIMIT } from "../vina-link.js";
import * as M from "../vina-model.js";
import * as V from "../vina-core.js";
import { previewInputs } from "../vina-scene.js";

const standardSource = readFileSync(new URL("../data/Pogget_Std.vina", import.meta.url), "utf8");
const standard = V.parse(standardSource);
const schema = JSON.parse(readFileSync(new URL("../data/schema.json", import.meta.url)));
const defaults = JSON.parse(readFileSync(new URL("../data/preview-inputs.json", import.meta.url)));
const inputs = (p) => previewInputs(defaults, p.board, false, false, "expanded", {});
const source = '\ufeff// 中文 😀 + / = % # &\r\nCard {\r\n\tview { type: "text", label: "测试 😀", width: 120, height: 40 }\r\n}\r\n';
const hash = (text) => "#c=" + Buffer.from(text, "utf8").toString("base64url");
const from = (fragment) => projectFromLink(fragment, standard, inputs, schema);

test("exact source, BOM, CRLF, comments and Unicode survive storage reload", () => {
  const next = from(hash(source));
  assert.equal(M.projectSource(next), source);
  const restored = M.projectFromJSON(JSON.stringify(next));
  assert.equal(M.projectSource(restored), source);
  V.setValue(restored.doc.roots[0].members.find((n) => n.name === "view"), "width", 140);
  assert.match(M.projectSource(restored), /width: 140/);
  assert.notEqual(M.projectSource(restored), source);
});
test("Pogget_Std and dependent presets use the existing validation rules", () => {
  assert.equal(M.projectSource(from(hash(standardSource))), standardSource);
  assert.ok(from(hash('Preset { dependsOn: "Pogget_Std" } Card { view { width: 120 } }')));
  assert.ok(from(hash('Preset { dependsOn: "MyBase" } Card { view { width: 120 } }')));
});
test("invalid envelopes, UTF-8, syntax and semantic values are rejected", () => {
  assert.equal(from(""), null);
  assert.equal(from("#other=value"), null);
  for (const value of ["#c=", "#c=a", "#c=Zg==", "#c=Zh", "#c=%", "#c=Zg&c=Zg", "#c=_w"])
    assert.throws(() => from(value), value);
  for (const text of ["", "\0", "A {", 'Card { view { width: -1 } }', 'Card { view { type: "unsupported" } }'])
    assert.throws(() => from(hash(text)), text);
  assert.throws(() => from("#c=" + "A".repeat(LINK_LIMIT)), /2 MiB/);
});
test("tampered original source cannot replace the validated document on reload", () => {
  const next = from(hash(source));
  next.linkedSource.source = 'Wrong { view { width: 42 } }';
  const restored = M.projectFromJSON(JSON.stringify(next));
  assert.equal(restored.linkedSource, undefined);
  assert.match(M.projectSource(restored), /Card/);
  next.linkedSource.source = "A {";
  assert.equal(M.projectFromJSON(JSON.stringify(next)).linkedSource, undefined);
});
if (process.env.VINA_NATIVE_URL) {
  test("native C++ encoder interoperates with the web decoder byte for byte", () => {
    const url = new URL(readFileSync(process.env.VINA_NATIVE_URL, "utf8"));
    assert.equal(M.projectSource(from(url.hash)), source);
  });
}
