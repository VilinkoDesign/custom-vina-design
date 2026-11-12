import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as V from "../vina-core.js";
import * as B from "../vina-behavior.js";
import * as M from "../vina-model.js";
import {
  behaviorOverview,
  detailMembers,
  detailLayout,
  nodeHeight,
  nodeWidth,
  summaryRoutes,
} from "../vina-behavior-layout.js";
import { sortPillSource } from "./fixtures/sort-pill.mjs";

const standard = V.parse(
  readFileSync(new URL("../data/Pogget_Std.vina", import.meta.url), "utf8"),
);
const inputs = JSON.parse(
  readFileSync(new URL("../data/preview-inputs.json", import.meta.url), "utf8"),
);
const schema = JSON.parse(
  readFileSync(new URL("../data/schema.json", import.meta.url), "utf8"),
);
const fixture = () => {
  const project = M.projectFromVina(sortPillSource),
    graph = B.createGraph(project, standard, inputs);
  return { project, graph, doc: M.effectiveProject(project, standard) };
};
function noOverlap(nodes) {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      assert.ok(
        a.x + nodeWidth(a) <= b.x ||
          b.x + nodeWidth(b) <= a.x ||
          a.y + nodeHeight(a) <= b.y ||
          b.y + nodeHeight(b) <= a.y,
        `Overlapping nodes: ${a.id} and ${b.id}`,
      );
    }
}
test("the two-level sort pill folds hundreds of paint/layout nodes into sixteen meaningful behaviors", () => {
  const { project, graph, doc } = fixture(),
    before = JSON.stringify(graph),
    source = V.serialize(project.doc);
  M.validate(project, standard, inputs, schema);
  const overview = behaviorOverview(graph, doc, "SortPill");
  assert.ok(overview.total > 700);
  assert.equal(overview.nodes.length, 16);
  assert.ok(overview.nodes.length < overview.total / 30);
  assert.deepEqual(
    overview.nodes
      .filter((n) => n.role === "logic")
      .map((n) => n.title)
      .sort(),
    ["expand", "menuOpen", "zoneSize", "zoneTime"],
  );
  assert.ok(!overview.nodes.some((n) => n.path === "SortPill.vars.hotspot"));
  assert.ok(
    overview.edges.some(
      (e) =>
        e.from === "hover:SortPill.view.Hotspot" &&
        e.to === "logic:SortPill.vars.expand",
    ),
  );
  assert.ok(
    overview.edges.some(
      (e) =>
        e.from === "logic:SortPill.vars.menuOpen" &&
        e.to === "hover:SortPill.view.Hotspot" &&
        e.kind === "retain",
    ),
  );
  assert.equal(
    overview.edges.length,
    new Set(overview.edges.map((e) => e.from + ":" + e.to + ":" + e.kind)).size,
  );
  noOverlap(overview.nodes);
  assert.equal(JSON.stringify(graph), before);
  assert.equal(V.serialize(project.doc), source);
  assert.equal(
    V.serialize(B.compileGraph(project, standard, graph, inputs, schema).doc),
    source,
  );
});

test("region drilldown keeps interactivity editable and folds its static paint and geometry", () => {
  const { graph, doc } = fixture(),
    overview = behaviorOverview(graph, doc, "SortPill");
  const menu = overview.nodes.find(
    (node) => node.id === "region:SortPill.view.TimeMenu",
  );
  assert.match(menu.description, /2 个动作/);
  const ids = detailMembers(graph, menu),
    nodes = graph.nodes.filter((node) => ids.has(node.id));
  assert.ok(nodes.length < menu.members.length);
  assert.ok(
    nodes.some(
      (node) =>
        node.type === "action" && node.action === "pogget.action.sortTimeAsc",
    ),
  );
  assert.ok(
    nodes.some(
      (node) =>
        node.type === "action" && node.action === "pogget.action.sortTimeDesc",
    ),
  );
  assert.ok(
    nodes.some(
      (node) =>
        node.type === "bind" && node.path === "SortPill.view.TimeMenu.visible",
    ),
  );
  assert.ok(
    !nodes.some(
      (node) =>
        node.type === "bind" &&
        node.path === "SortPill.view.TimeMenu.Panel.borderColor",
    ),
  );
  const layout = detailLayout(nodes, graph.edges);
  noOverlap(nodes.map((node) => ({ ...node, ...layout.get(node.id) })));
  assert.deepEqual([...layout], [...detailLayout(nodes, graph.edges)]);
});

test("summary connections use separate tracks and avoid intervening card interiors", () => {
  const { graph, doc } = fixture(),
    overview = behaviorOverview(graph, doc, "SortPill");
  const routes = summaryRoutes(overview.nodes, overview.edges);
  for (const [edge, route] of routes) {
    assert.ok(!/NaN|Infinity/.test(route.path));
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      for (const node of overview.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;
        if (a.x === b.x)
          assert.ok(
            !(
              a.x > node.x &&
              a.x < node.x + nodeWidth(node) &&
              Math.max(a.y, b.y) > node.y &&
              Math.min(a.y, b.y) < node.y + nodeHeight(node)
            ),
            `Vertical wire crosses ${node.id}`,
          );
        else if (a.y === b.y)
          assert.ok(
            !(
              a.y > node.y &&
              a.y < node.y + nodeHeight(node) &&
              Math.max(a.x, b.x) > node.x &&
              Math.min(a.x, b.x) < node.x + nodeWidth(node)
            ),
            `Horizontal wire crosses ${node.id}`,
          );
      }
    }
  }
  assert.equal(routes.size, overview.edges.length);
  assert.equal(
    new Set([...routes.values()].map((route) => route.path)).size,
    routes.size,
  );
});

test("root view properties stay in the root region and optional layouts cannot replace native source", () => {
  const project = M.projectFromVina(
    'Card { state { expanded: false }, view { width: ${state.expanded} ? 240 : 120, height: 40, toggle: "state.expanded" } }',
  );
  const graph = B.createGraph(project, standard, inputs),
    overview = behaviorOverview(graph, project.doc, "Card");
  assert.ok(overview.nodes.some((node) => node.id === "region:Card.view"));
  assert.ok(
    !overview.nodes.some((node) => node.id === "region:Card.view.width"),
  );
  graph.overviewPositions = { "region:Card.view": { x: 900, y: -40 } };
  const next = B.compileGraph(project, standard, graph, inputs, schema);
  const restored = M.projectFromJSON(JSON.stringify(next));
  const loaded = B.createGraph(restored, standard, inputs);
  assert.equal(
    behaviorOverview(loaded, restored.doc, "Card").nodes.find(
      (node) => node.id === "region:Card.view",
    ).x,
    900,
  );
  assert.equal(V.serialize(next.doc), V.serialize(project.doc));
  graph.overviewPositions["region:Card.view"].x = Infinity;
  assert.throws(() => B.validateGraphShape(graph), /位置无效/);
});
