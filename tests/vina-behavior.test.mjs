import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as V from "../vina-core.js";
import * as M from "../vina-model.js";
import * as B from "../vina-behavior.js";

const standard = V.parse(
  readFileSync(new URL("../data/Pogget_Std.vina", import.meta.url), "utf8"),
);
const schema = JSON.parse(
  readFileSync(new URL("../data/schema.json", import.meta.url), "utf8"),
);
const inputs = JSON.parse(
  readFileSync(new URL("../data/preview-inputs.json", import.meta.url), "utf8"),
);
const source =
  'Card { state { expanded: false, caption: "${not.a.reference}" }, view { type: "button", width: 120, height: 40, action: "pogget.action.view.toggle", hover { opacity: 0.8 } } }';
const project = (text = source) => M.projectFromVina(text);
const compile = (p, g) => {
  const n = B.compileGraph(p, standard, g, inputs, schema);
  M.validate(n, standard, inputs, schema);
  return n;
};
function interaction(p) {
  const graph = B.createGraph(p, standard, inputs);
  const state = graph.nodes.find(
    (n) => n.type === "state" && n.path.endsWith("expanded"),
  );
  const event = graph.nodes.find(
    (n) => n.type === "event" && n.event === "click",
  );
  const toggle = B.newNode("toggle", "Card", "Card.view");
  const expr = { ...B.newNode("expression", "Card"), code: "${a} ? 240 : 120" };
  const bind = {
    ...B.newNode("bind", "Card"),
    path: "Card.view.width",
    fallback: "120",
  };
  graph.nodes.push(toggle, expr, bind);
  B.connect(graph, event.id, toggle.id, "event");
  B.connect(graph, state.id, expr.id, "a");
  B.connect(graph, expr.id, bind.id, "value");
  return { graph, state, event, toggle, expr, bind };
}

test("entire native standard projects without rewriting source or reference files", () => {
  const p = V.createProject(),
    before = V.serialize(standard),
    graph = B.createGraph(p, standard, inputs);
  assert.ok(graph.nodes.length > 3000);
  const next = compile(p, graph);
  assert.equal(V.serialize(next.doc), V.serialize(p.doc));
  assert.equal(V.serialize(standard), before);
  assert.equal(graph.nodes.length, new Set(graph.nodes.map((n) => n.id)).size);
});

test("existing states, hover, relative references, dynamic actions and comments survive round trip", () => {
  const p = project(`Card {
    state { expanded: false },
    view { width: 120, height: 40, toggle: "state.expanded",
      action: \${state.expanded} ? "pogget.action.view.toggle" : "",
      label: "literal \${a}",
      opacity: /* \${fake.ref} */ \${self.hoverProgress} + 0.1,
      hover { opacity: 0.9 }
    }
  }`);
  const g = B.createGraph(p, standard, inputs);
  assert.ok(
    g.nodes.some(
      (n) => n.type === "action" && n.code.includes("state.expanded"),
    ),
  );
  assert.equal(V.serialize(compile(p, g).doc), V.serialize(p.doc));
  assert.equal(
    B.mapReferences('"${a}" + ${a} /* ${a} */', () => "42"),
    '"${a}" + 42 /* ${a} */',
  );
});

test("click state and conditional property compile to native behavior and evaluate at runtime", () => {
  const p = project(),
    { graph } = interaction(p),
    next = compile(p, graph);
  const rt = new V.Runtime(next.doc);
  assert.equal(rt.get("Card.view.width"), 120);
  assert.equal(
    new V.Runtime(next.doc, { "Card.state.expanded": true }).get(
      "Card.view.width",
    ),
    240,
  );
  assert.equal(rt.get("Card.view.toggle"), "Card.state.expanded");
  assert.equal(rt.get("Card.view.action"), "pogget.action.view.toggle");
  assert.equal(V.serialize(p.doc), V.serialize(project().doc));
});

test("layout, loose nodes and edges survive JSON reload; stale or forged metadata rebuilds from source", () => {
  const p = project(),
    { graph, expr } = interaction(p);
  expr.x = 731;
  expr.y = -42;
  graph.nodes.push(B.newNode("value", "Card"));
  const next = compile(p, graph),
    restored = M.projectFromJSON(JSON.stringify(next));
  const reloaded = B.createGraph(restored, standard, inputs);
  assert.equal(reloaded.nodes.find((n) => n.id === expr.id).x, 731);
  assert.equal(reloaded.nodes.find((n) => n.id === expr.id).y, -42);
  assert.equal(reloaded.nodes.length, graph.nodes.length);
  restored.behaviorGraph.graph.nodes.find((n) => n.id === expr.id).code = "999";
  // Metadata cannot replace the authoritative native property.
  assert.notEqual(
    B.createGraph(restored, standard, inputs).nodes.find(
      (n) => n.id === expr.id,
    )?.code,
    "999",
  );
  V.setValue(V.block(restored.doc.roots[0], "view"), "width", 88);
  assert.ok(
    !B.createGraph(restored, standard, inputs).nodes.some(
      (n) => n.id === expr.id,
    ),
  );
});

test("deleting or disconnecting newly applied behavior clears native bindings on subsequent edits", () => {
  const p = project(),
    first = interaction(p),
    next = compile(p, first.graph);
  const g = B.createGraph(next, standard, inputs);
  g.nodes = g.nodes.filter(
    (n) => n.id !== first.bind.id && n.id !== first.toggle.id,
  );
  g.edges = g.edges.filter((e) => g.nodes.some((n) => n.id === e.to));
  const cleared = compile(next, g),
    rt = new V.Runtime(cleared.doc);
  assert.equal(rt.get("Card.view.width"), 120);
  assert.equal(rt.get("Card.view.toggle", ""), "");
  assert.equal(
    V.serialize(compile(cleared, B.createGraph(cleared, standard, inputs)).doc),
    V.serialize(cleared.doc),
  );
});

test("multiple output writers, missing inputs, missing variables, read-only fields and invalid state are rejected atomically", () => {
  const cases = [
    ({ graph, bind }) => {
      const duplicate = { ...bind, id: B.graphId() };
      graph.nodes.push(duplicate);
      B.connect(
        graph,
        graph.edges.find((e) => e.to === bind.id).from,
        duplicate.id,
        "value",
      );
    },
    ({ graph, state }) => {
      graph.edges = graph.edges.filter((e) => e.from !== state.id);
    },
    ({ expr }) => {
      expr.code = "${Card.state.missing}";
    },
    ({ bind }) => {
      bind.path = "Card.view.hovered";
    },
    ({ state }) => {
      state.code = "1 + 1";
    },
    ({ state }) => {
      state.code = "2";
    },
    ({ expr }) => {
      expr.code = "${a} ? -10 : 120";
    },
  ];
  for (const change of cases) {
    const p = project(),
      before = JSON.stringify(p),
      data = interaction(p);
    change(data);
    // Geometry validation is evaluated against supplied runtime state, too.
    assert.throws(() => {
      const next = compile(p, data.graph);
      M.validate(
        next,
        standard,
        { ...inputs, "Card.state.expanded": true },
        schema,
      );
    });
    assert.equal(JSON.stringify(p), before);
  }
});

test("event and data ports reject mismatches, duplicate inputs replace, and cycles are rejected", () => {
  const p = project(),
    { graph, state, event, expr, bind } = interaction(p);
  assert.throws(() => B.connect(graph, event.id, expr.id, "a"), /类型不匹配/);
  assert.throws(() => B.connect(graph, expr.id, expr.id, "a"));
  B.connect(graph, state.id, expr.id, "a");
  assert.equal(
    graph.edges.filter((e) => e.to === expr.id && e.port === "a").length,
    1,
  );
  const other = { ...B.newNode("expression", "Card"), code: "${a}" };
  graph.nodes.push(other);
  B.connect(graph, expr.id, other.id, "a");
  assert.throws(() => B.connect(graph, other.id, expr.id, "a"), /循环/);
  assert.ok(graph.edges.some((e) => e.to === bind.id));
});

test("long press executes one native action and cannot toggle state", () => {
  const p = project(),
    { graph, event } = interaction(p);
  event.event = "hold";
  assert.throws(() => compile(p, graph), /仅支持点击/);
  graph.edges = graph.edges.filter(
    (e) => graph.nodes.find((n) => n.id === e.to)?.type !== "toggle",
  );
  const next = compile(p, graph);
  assert.equal(
    new V.Runtime(next.doc).get("Card.view.holdAction"),
    "pogget.action.view.toggle",
  );
  assert.equal(new V.Runtime(next.doc).get("Card.view.action"), "");
});

test("state deletion with live references, hostile metadata and invalid paths fail safely", () => {
  const p = project(),
    { graph, state } = interaction(p);
  graph.nodes = graph.nodes.filter((n) => n.id !== state.id);
  graph.edges = graph.edges.filter((e) => e.from !== state.id);
  assert.throws(() => compile(p, graph));
  const g = B.createGraph(p, standard, inputs);
  for (const bad of [
    null,
    { ...g, nodes: [null] },
    { ...g, edges: [{ from: "missing", to: "missing", port: "a" }] },
    { ...g, nodes: [{ ...g.nodes[0], x: Infinity }] },
  ])
    assert.throws(() => B.validateGraphShape(bad));
  const output = { ...B.newNode("bind", "Card"), path: "pogget.locked" },
    value = B.newNode("value", "Card");
  g.nodes.push(output, value);
  B.connect(g, value.id, output.id, "value");
  assert.throws(() => compile(p, g), /不可绑定/);
});

test("inherited changes only create local overrides and inherited toggles cannot be silently deleted", () => {
  const base = V.parse(
    'Card { state { expanded: false }, view { width: ${state.expanded} ? 240 : 120, height: 40, toggle: "state.expanded" } }',
  );
  const p = {
    ...project('Preset { dependsOn: "Test" }'),
    base,
    baseName: "Test",
  };
  const before = V.serialize(base),
    graph = B.createGraph(p, standard, inputs);
  assert.equal(V.serialize(compile(p, graph).doc), V.serialize(p.doc));
  const expr = graph.nodes.find((n) => n.type === "expression");
  expr.code = "${a} ? 300 : 120";
  const next = compile(p, graph);
  assert.equal(
    new V.Runtime(M.effectiveProject(next, standard), {
      "Card.state.expanded": true,
    }).get("Card.view.width"),
    300,
  );
  assert.equal(V.serialize(base), before);
  const toggle = graph.nodes.find((n) => n.type === "toggle");
  graph.edges = graph.edges.filter((e) => e.to !== toggle.id);
  assert.throws(() => compile(p, graph), /增量覆盖删除/);
});

test("the downloadable disclosure example validates and reconstructs to the same native source", () => {
  const p = project(
    readFileSync(
      new URL("../examples/BehaviorDisclosure.vina", import.meta.url),
      "utf8",
    ),
  );
  const graph = B.createGraph(p, standard, inputs);
  assert.equal(V.serialize(compile(p, graph).doc), V.serialize(p.doc));
  assert.equal(
    new V.Runtime(p.doc, { "Disclosure.state.expanded": true }).get(
      "Disclosure.view.width",
    ),
    260,
  );
});

test("every reference in expressions with more than three inputs has an editable connection", () => {
  const p = project(
    "Card { state { a: 1, b: 2, c: 3, d: 4, e: 5 }, view { width: ${state.a} + ${state.b} + ${state.c} + ${state.d} + ${state.e}, height: 40 } }",
  );
  const graph = B.createGraph(p, standard, inputs);
  const expression = graph.nodes.find((n) => n.type === "expression");
  assert.equal(B.inputsOf(expression).length, 5);
  assert.equal(graph.edges.filter((e) => e.to === expression.id).length, 5);
  assert.equal(V.serialize(compile(p, graph).doc), V.serialize(p.doc));
});
