import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as V from "../vina-core.js";
import * as M from "../vina-model.js";
import * as B from "../vina-behavior.js";
import * as I from "../vina-interactions.js";

const standard = V.parse(
  readFileSync(new URL("../data/Pogget_Std.vina", import.meta.url), "utf8"),
);
const inputs = JSON.parse(
  readFileSync(new URL("../data/preview-inputs.json", import.meta.url), "utf8"),
);
const schema = JSON.parse(
  readFileSync(new URL("../data/schema.json", import.meta.url), "utf8"),
);
const id = (doc, path) => V.index(doc).byPath.get(path).id;
const fixture = () =>
  M.projectFromVina(`Demo {
  view { type: "group", width: 320, height: 200,
    Button { type: "button", width: 100, height: 40, background: rgb(80,120,200) },
    Rect { type: "rect", x: 140, width: 100, height: 80 }
  }
}`);

test("deleting a child resolves live property/hover references without rewriting inert text or unrelated bindings", () => {
  const p = M.projectFromVina(`Holder {
    vars { twice: \${Holder.view.Item.width} * 2, hover: \${Holder.view.Item.hoverProgress} },
    view { type: "group", width: 300, height: 200,
      Item { type: "rect", width: 80, height: 40 }
    }
  }
  Other { vars { offset: 10 }, view {
    type: "rect", width: \${Holder.view.Item.width} + \${vars.offset},
    height: \${Holder.vars.twice}, visible: !\${Holder.view.Item.hovered},
    label: "literal \${Holder.view.Item.width}", textLiteral: true
  } }`);
  const source = V.serialize(p.doc);
  assert.equal(
    M.removeViews(p, [id(p.doc, "Holder.view.Item")], standard, inputs),
    4,
  );
  M.validate(p, standard, inputs, schema);
  const rt = new V.Runtime(p.doc, inputs);
  assert.equal(rt.get("Holder.vars.twice"), 160);
  assert.equal(rt.get("Holder.vars.hover"), 0);
  assert.equal(rt.get("Other.view.width"), 90);
  assert.equal(rt.get("Other.view.height"), 160);
  assert.equal(rt.get("Other.view.visible"), true);
  assert.equal(rt.get("Other.view.label"), "literal ${Holder.view.Item.width}");
  assert.match(
    V.index(p.doc).byPath.get("Other.view.width").raw,
    /\$\{vars.offset\}/,
  );
  assert.equal(new V.Runtime(V.parse(source)).get("Other.view.width"), 90);
});

test("deleting a whole group removes its owned metadata, freezes UI/state aliases and clears remaining toggles atomically", () => {
  const p = M.projectFromVina(`Group {
    state { open: false }, ui { Width { type: "number", default: 80, min: 0, max: 100, step: 1 } },
    vars { shown: \${Group.view.Button.hovered} },
    view { type: "group", width: 200, height: 80, Button { width: 80, height: 40, toggle: "state.open" } }
  }
  Other { view { type: "button", width: \${Group.ui.Width.value}, height: 40,
    toggle: "Group.state.open", visible: !\${Group.state.open}
  } }`);
  M.validate(p, standard, inputs, schema);
  const history = new V.History(p);
  p.behaviorGraph = { stale: true };
  assert.equal(
    M.removeViews(p, [id(p.doc, "Group.view")], standard, inputs),
    3,
  );
  assert.ok(!p.doc.roots.some((root) => root.name === "Group"));
  assert.equal(p.behaviorGraph, undefined);
  const rt = M.validate(p, standard, inputs, schema).runtime;
  assert.equal(rt.get("Other.view.width"), 80);
  assert.equal(rt.get("Other.view.visible"), true);
  assert.ok(!V.property(V.index(p.doc).byPath.get("Other.view"), "toggle"));
  history.commit(p);
  const restored = history.undo();
  assert.ok(V.index(restored.doc).byPath.has("Group.state.open"));
  M.validate(restored, standard, inputs, schema);
  const broken = M.projectFromVina(
    'Bad { vars { broken: ${Bad.view.Item.width} }, view { type: "group", Item { width: 1 / 0, height: 40 } } }',
  );
  const before = V.serialize(broken.doc);
  assert.throws(
    () => M.removeViews(broken, [id(broken.doc, "Bad.view.Item")], standard),
    /零/,
  );
  assert.equal(V.serialize(broken.doc), before);
});

test("removing inherited overrides preserves references that remain available from the base", () => {
  const p = M.projectFromVina(
    'Preset { dependsOn: "Base" } Shared { view { width: 200 } } Other { view { width: ${Shared.view.width}, height: 40 } }',
  );
  p.baseName = "Base";
  p.base = V.parse('Shared { view { type: "rect", width: 100, height: 40 } }');
  const raw = V.index(p.doc).byPath.get("Other.view.width").raw;
  assert.equal(
    M.removeViews(p, [id(p.doc, "Shared.view")], standard, inputs),
    0,
  );
  assert.equal(V.index(p.doc).byPath.get("Other.view.width").raw, raw);
  assert.equal(
    M.validate(p, standard, inputs, schema).runtime.get("Other.view.width"),
    100,
  );
});

test("ordinary inspector click and hover bindings compile to native semantics and round-trip through the behavior graph", () => {
  const p = fixture(),
    button = id(p.doc, "Demo.view.Button"),
    rect = id(p.doc, "Demo.view.Rect");
  const state = I.createBooleanState(p, standard, "Demo", "shown", false);
  I.setClickToggle(p, standard, button, state);
  I.bindInteraction(
    p,
    standard,
    rect,
    { key: "visible", kind: "state", source: state, off: "false", on: "true" },
    inputs,
    schema,
  );
  I.bindInteraction(
    p,
    standard,
    rect,
    {
      key: "opacity",
      kind: "hover",
      source: "Demo.view.Button.hovered",
      off: "0.3",
      on: "1",
    },
    inputs,
    schema,
  );
  const rt = M.validate(p, standard, inputs, schema).runtime;
  assert.equal(rt.get("Demo.view.Rect.visible"), false);
  assert.equal(rt.get("Demo.view.Rect.opacity"), 0.3);
  const active = new V.Runtime(p.doc, {
    [state]: true,
    "Demo.view.Button.hovered": true,
  });
  assert.equal(active.get("Demo.view.Rect.visible"), true);
  assert.equal(active.get("Demo.view.Rect.opacity"), 1);
  assert.equal(rt.get("Demo.view.Button.toggle"), state);
  const config = I.interactionBinding(
    p.doc,
    V.index(p.doc).byId.get(rect),
    "opacity",
  );
  assert.deepEqual(config, {
    key: "opacity",
    kind: "hover",
    source: "Demo.view.Button.hovered",
    off: "0.3",
    on: "1",
  });
  const graph = B.createGraph(p, standard, inputs),
    source = V.serialize(p.doc);
  assert.equal(
    V.serialize(B.compileGraph(p, standard, graph, inputs, schema).doc),
    source,
  );
  I.setBooleanDefault(p, standard, state, true);
  assert.equal(new V.Runtime(p.doc).get("Demo.view.Rect.visible"), true);
  I.setClickToggle(p, standard, button, "");
  assert.equal(new V.Runtime(p.doc).get(state), true);
  assert.ok(!V.property(V.index(p.doc).byId.get(button), "toggle"));
});

test("inactive branch values, types, sources and duplicate variables are validated before writes", () => {
  const p = fixture(),
    rect = id(p.doc, "Demo.view.Rect");
  const state = I.createBooleanState(p, standard, "Demo", "shown", false);
  const before = V.serialize(p.doc);
  assert.throws(
    () => I.createBooleanState(p, standard, "Demo", "shown", true),
    /存在/,
  );
  for (const config of [
    { key: "opacity", on: "2", off: "1", source: state, kind: "state" },
    { key: "visible", on: "1", off: "false", source: state, kind: "state" },
    {
      key: "visible",
      on: "true",
      off: "false",
      source: "Demo.view.Missing.hovered",
      kind: "hover",
    },
    { key: "toggle", on: "true", off: "false", source: state, kind: "state" },
  ])
    assert.throws(() =>
      I.bindInteraction(p, standard, rect, config, inputs, schema),
    );
  assert.equal(V.serialize(p.doc), before);
  const numeric = M.projectFromVina(
    "Counter { state { count: 5 }, view { width: ${state.count}, height: 40 } }",
  );
  assert.equal(
    I.interactionBinding(
      numeric.doc,
      V.index(numeric.doc).byPath.get("Counter.view"),
      "width",
    ),
    null,
  );
});

test("rename, duplicate and copy/paste keep click targets attached to their own state", () => {
  const p = fixture(),
    button = id(p.doc, "Demo.view.Button");
  const state = I.createBooleanState(p, standard, "Demo", "shown", false);
  I.setClickToggle(p, standard, button, state);
  I.bindInteraction(
    p,
    standard,
    id(p.doc, "Demo.view.Rect"),
    { key: "visible", kind: "state", source: state, off: "false", on: "true" },
    inputs,
    schema,
  );
  M.rename(p.doc, p.doc.roots[0].id, "Renamed");
  assert.equal(
    new V.Runtime(p.doc).get("Renamed.view.Button.toggle"),
    "Renamed.state.shown",
  );
  const [copy] = M.duplicate(p.doc, [id(p.doc, "Renamed.view")]);
  const copiedRoot = V.index(p.doc).paths.get(copy).split(".")[0];
  assert.equal(
    new V.Runtime(p.doc).get(copiedRoot + ".view.Button.toggle"),
    copiedRoot + ".state.shown",
  );
  const bundle = M.copySelection(p.doc, [id(p.doc, "Renamed.view")]);
  const [pasted] = M.pasteSelection(p.doc, bundle);
  const pastedRoot = V.index(p.doc).paths.get(pasted).split(".")[0];
  assert.equal(
    new V.Runtime(p.doc).get(pastedRoot + ".view.Button.toggle"),
    pastedRoot + ".state.shown",
  );
  M.validate(p, standard, inputs, schema);
});
