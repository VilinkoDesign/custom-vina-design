import * as V from "./vina-core.js";
import { inputsOf } from "./vina-behavior.js";

export const SUMMARY_WIDTH = 196;
export const SUMMARY_HEIGHT = 86;
export const nodeHeight = (node) =>
  node.summary ? SUMMARY_HEIGHT : 88 + Math.max(1, inputsOf(node).length) * 26;
export const nodeWidth = (node) => (node.summary ? SUMMARY_WIDTH : 216);
const unique = (items) => [...new Set(items)];

// A view of the authoring graph, never a second execution model. Bundling and
// inlining only change presentation; every underlying node remains editable.
export function behaviorOverview(graph, doc, component) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to).push(edge);
  }
  const definitions = new Map(
    graph.nodes
      .filter((node) => node.type === "bind")
      .map((node) => [node.path, node]),
  );
  const index = V.index(doc),
    prefix = component + ".",
    cards = new Map(),
    links = new Map();
  const own = graph.nodes.filter((node) => node.component === component);
  const groupPath = (path) => {
    const at = path.indexOf(".view");
    if (at < 0) return component;
    const root = path.slice(0, at + 5),
      child = path.slice(at + 6).split(".")[0];
    return child &&
      !V.META.has(child) &&
      index.byPath.get(root + "." + child)?.kind === "block"
      ? root + "." + child
      : root;
  };
  const nameOf = (path) =>
    path === component + ".view" ? component : path.split(".").at(-1);
  const card = (id, title, role, path, members = []) => {
    if (!cards.has(id))
      cards.set(id, {
        id,
        title,
        role,
        path,
        summary: true,
        members: new Set(),
        primary: null,
        x: 0,
        y: 0,
      });
    const item = cards.get(id);
    for (const member of members) item.members.add(member);
    return item;
  };
  const link = (from, to, kind = "data") => {
    if (!from || !to || from === to) return;
    const key = from + "\n" + to + "\n" + kind;
    if (!links.has(key)) links.set(key, { from, to, kind });
  };
  const calculation = (bind) =>
    byId.get(
      incoming.get(bind.id)?.find((edge) => edge.port === "value")?.from,
    );
  const membersFor = (bind) => [bind.id, calculation(bind)?.id].filter(Boolean);
  const rawReferences = (node) => {
    if (!node?.code) return [];
    try {
      return V.references(V.parseExpression(node.code));
    } catch {
      return [];
    }
  };
  const aliases = new Map();
  for (const [path, bind] of definitions) {
    const calc = calculation(bind);
    if (!calc || !["expression", "condition"].includes(calc.type)) continue;
    try {
      const expr = V.parseExpression(calc.code);
      if (
        "ref" in expr &&
        inputsOf(calc).some((port) => port.key === expr.ref)
      ) {
        const source = byId.get(
          incoming.get(calc.id)?.find((edge) => edge.port === expr.ref)?.from,
        );
        if (source?.type === "reference") aliases.set(path, source.path);
      }
    } catch {
      /* Incomplete drafts remain editable in detail. */
    }
  }
  function sourcePaths(node, seen = new Set()) {
    if (!node || seen.has(node.id) || seen.size > 64) return new Set();
    const next = new Set(seen).add(node.id),
      result = new Set();
    const merge = (values) => {
      for (const value of values) result.add(value);
    };
    const followPath = (path) => {
      if (
        /\.(hovered|hoverProgress)$/.test(path) ||
        /^[^.]+\.state\./.test(path)
      )
        result.add(path);
      else if (definitions.has(path))
        merge(sourcePaths(definitions.get(path), next));
      else if (
        path.startsWith("pogget.") &&
        !/\.(width|height|x|y)$/.test(path)
      )
        result.add("pogget");
    };
    if (node.type === "state" || node.type === "reference")
      followPath(node.path);
    for (const edge of incoming.get(node.id) || [])
      merge(sourcePaths(byId.get(edge.from), next));
    for (const ref of rawReferences(node))
      if (!inputsOf(node).some((port) => port.key === ref))
        followPath(
          V.resolveReference(ref, node.owner || component + ".view.value"),
        );
    return result;
  }
  const dependencyCache = new Map();
  const dependencies = (node) => {
    if (!dependencyCache.has(node.id))
      dependencyCache.set(node.id, sourcePaths(node));
    return dependencyCache.get(node.id);
  };
  const variableCards = new Map();
  for (const [path, bind] of definitions) {
    if (!path.startsWith(prefix + "vars.") || aliases.has(path)) continue;
    if (![...dependencies(bind)].some((value) => value !== "pogget")) continue;
    const item = card(
      "logic:" + path,
      path.slice((prefix + "vars.").length),
      "logic",
      path,
      membersFor(bind),
    );
    item.primary = calculation(bind)?.id;
    item.description = calculation(bind)?.code || "共享计算";
    variableCards.set(path, item);
  }
  function upstream(node, seen = new Set()) {
    if (!node || seen.has(node.id) || seen.size > 64) return new Set();
    const next = new Set(seen).add(node.id),
      result = new Set();
    const merge = (values) => {
      for (const value of values) result.add(value);
    };
    const followPath = (path, depth = 0) => {
      if (depth > 64) return;
      if (aliases.has(path)) {
        followPath(aliases.get(path), depth + 1);
        return;
      }
      if (variableCards.has(path)) {
        result.add(variableCards.get(path).id);
        return;
      }
      if (/\.(hovered|hoverProgress)$/.test(path)) {
        const view = path.replace(/\.(hovered|hoverProgress)$/, ""),
          group = groupPath(view);
        const item = card("hover:" + group, nameOf(group), "hover", group, [
          node.id,
        ]);
        item.description =
          "悬停 · " +
          (V.block(index.byPath.get(group), "hoverRegion")
            ? "进入 / 保持热区"
            : "悬停状态与进度");
        result.add(item.id);
      } else if (/^[^.]+\.state\./.test(path)) {
        const state = graph.nodes.find(
          (candidate) => candidate.type === "state" && candidate.path === path,
        );
        const item = card(
          "state:" + path,
          path.split(".").at(-1),
          "state",
          path,
          [state?.id || node.id],
        );
        item.primary = state?.id;
        item.description = "状态 · " + (state?.code || "读取状态");
        result.add(item.id);
      } else if (definitions.has(path))
        merge(upstream(definitions.get(path), next));
      else if (
        path.startsWith("pogget.") &&
        !/\.(width|height|x|y)$/.test(path)
      ) {
        const item = card("host:" + component, "宿主条件", "host", "pogget", [
          node.id,
        ]);
        item.description = "窗口、主题与运行状态";
        result.add(item.id);
      }
    };
    if (node.type === "state" || node.type === "reference")
      followPath(node.path);
    for (const edge of incoming.get(node.id) || [])
      merge(upstream(byId.get(edge.from), next));
    for (const ref of rawReferences(node))
      if (!inputsOf(node).some((port) => port.key === ref))
        followPath(
          V.resolveReference(ref, node.owner || component + ".view.value"),
        );
    return result;
  }
  for (const item of variableCards.values()) {
    const bind = definitions.get(item.path);
    for (const from of upstream(calculation(bind))) link(from, item.id);
  }
  // A top-level UI region is one result, including all its paint attributes,
  // transitions and descendant actions. Its local highlighting stays inside it.
  const regionNodes = new Map();
  for (const node of own) {
    const event = byId.get(
      incoming.get(node.id)?.find((edge) => edge.port === "event")?.from,
    );
    const path = event?.target || node.path || node.target || node.owner || "";
    if (!path.startsWith(prefix + "view")) continue;
    const region = groupPath(path);
    if (!regionNodes.has(region)) regionNodes.set(region, []);
    regionNodes.get(region).push(node);
  }
  for (const [path, members] of regionNodes) {
    const reactive = members.filter(
      (node) =>
        node.type === "bind" &&
        [...dependencies(node)].some((value) => value !== "pogget"),
    );
    const events = members.filter((node) => node.type === "event");
    const retained = reactive.filter((node) =>
      node.path.includes(".hoverRegion.retain"),
    );
    const visual = reactive.filter(
      (node) => !node.path.includes(".hoverRegion."),
    );
    const hover = cards.get("hover:" + path);
    const active = members.filter(
      (node) =>
        ["event", "action", "toggle"].includes(node.type) ||
        (node.type === "bind" &&
          ([...dependencies(node)].some((value) => value !== "pogget") ||
            (/\.(visible|enabled)$/.test(node.path) &&
              dependencies(node).size))),
    );
    const activeMembers = unique(
      active.flatMap((node) =>
        node.type === "bind" ? membersFor(node) : [node.id],
      ),
    );
    if (hover) {
      for (const node of members) hover.members.add(node.id);
      hover.activeMembers = activeMembers;
    }
    if (hover)
      for (const bind of retained)
        for (const from of upstream(calculation(bind)))
          link(from, hover.id, "retain");
    const onlyHotzone =
      hover &&
      !members.some(
        (node) =>
          node.type === "action" ||
          /\.(opacity|fillOpacity|background|label|shadowOpacity)$/.test(
            node.path || "",
          ),
      ) &&
      ![...index.byPath].some(
        ([childPath, child]) =>
          childPath.startsWith(path + ".") &&
          child.kind === "property" &&
          child.name === "type" &&
          !["group"].includes(V.parseExpression(child.raw).value),
      );
    if (onlyHotzone || (!visual.length && !events.length)) continue;
    const item = card(
      "region:" + path,
      nameOf(path),
      "region",
      path,
      members.map((node) => node.id),
    );
    item.activeMembers = activeMembers;
    item.bindings = members
      .filter((node) => node.type === "bind")
      .map((node) => node.id);
    const actions = members.filter((node) =>
      ["action", "toggle"].includes(node.type),
    );
    const fields = new Set(visual.map((node) => node.path.split(".").at(-1)));
    const meaning = fields.has("visible")
      ? "显示与隐藏"
      : fields.has("width") || fields.has("x")
        ? "展开与布局"
        : "外观响应";
    item.description =
      meaning +
      (actions.length ? ` · ${actions.length} 个动作` : "") +
      ` · ${item.bindings.length} 项属性`;
    for (const bind of visual)
      for (const from of upstream(calculation(bind)))
        if (from !== "hover:" + path) link(from, item.id);
    if (events.length && !visual.length)
      item.description = `${actions.length} 个动作 · 点击 / 长按`;
  }
  // Static layout, color arithmetic and timing are parameters, not behavior steps.
  const used = new Set(
    [...cards.values()]
      .filter((item) => item.role === "region")
      .map((item) => item.id),
  );
  for (const edge of links.values())
    if (edge.kind === "retain") {
      used.add(edge.to);
      used.add(edge.from);
    }
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of links.values())
      if (used.has(edge.to) && !used.has(edge.from)) {
        used.add(edge.from);
        grew = true;
      }
  }
  const visible = [...cards.values()].filter((item) => used.has(item.id));
  const visibleLinks = [...links.values()].filter(
    (edge) => used.has(edge.from) && used.has(edge.to),
  );
  for (const item of visible) {
    item.members = [...item.members];
    if (!item.description) item.description = "交互逻辑";
    item.count = item.members.length;
  }
  const represented = new Set(visible.flatMap((item) => item.members));
  const parameters = own
    .filter((node) => !represented.has(node.id))
    .map((node) => node.id);
  if (!visible.length && own.length)
    visible.push({
      id: "parameters:" + component,
      title: "参数与样式",
      role: "parameters",
      path: component,
      summary: true,
      description: "布局、颜色与时长 · 按需展开",
      members: parameters,
      count: parameters.length,
      x: 0,
      y: 0,
    });
  layoutOverview(visible, visibleLinks);
  for (const item of visible) {
    const position = graph.overviewPositions?.[item.id];
    if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
      item.x = position.x;
      item.y = position.y;
    }
  }
  return { nodes: visible, edges: visibleLinks, parameters, total: own.length };
}

function layoutOverview(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node])),
    ranks = new Map();
  const rank = (node, seen = new Set()) => {
    if (ranks.has(node.id)) return ranks.get(node.id);
    if (node.role !== "logic" || seen.has(node.id)) return 0;
    const next = new Set(seen).add(node.id);
    const value =
      1 +
      Math.max(
        0,
        ...edges
          .filter((edge) => edge.to === node.id && edge.kind !== "retain")
          .map((edge) => rank(byId.get(edge.from), next)),
      );
    ranks.set(node.id, value);
    return value;
  };
  const last =
    Math.min(
      3,
      Math.max(
        1,
        ...nodes
          .filter((node) => node.role === "logic")
          .map((node) => rank(node)),
      ),
    ) + 1;
  for (const node of nodes)
    node.lane =
      node.role === "region"
        ? last
        : node.role === "logic"
          ? Math.min(3, rank(node))
          : 0;
  const lanes = new Map();
  for (const node of nodes) {
    if (!lanes.has(node.lane)) lanes.set(node.lane, []);
    lanes.get(node.lane).push(node);
  }
  // Alternating barycentric sweeps put related branches next to each other.
  for (let pass = 0; pass < 6; pass++) {
    const order = [...lanes.keys()].sort((a, b) => (pass % 2 ? b - a : a - b));
    for (const lane of order) {
      const items = lanes.get(lane),
        old = new Map(items.map((node, i) => [node.id, i]));
      const score = (node) => {
        const adjacent = edges
          .filter(
            (edge) =>
              edge.kind !== "retain" &&
              (pass % 2 ? edge.from === node.id : edge.to === node.id),
          )
          .map((edge) => byId.get(pass % 2 ? edge.to : edge.from));
        return adjacent.length
          ? adjacent.reduce(
              (sum, neighbor) =>
                sum +
                (lanes.get(neighbor.lane).indexOf(neighbor) + 0.5) /
                  lanes.get(neighbor.lane).length,
              0,
            ) / adjacent.length
          : (old.get(node.id) + 0.5) / items.length;
      };
      items.sort(
        (a, b) => score(a) - score(b) || old.get(a.id) - old.get(b.id),
      );
    }
  }
  const max = Math.max(1, ...[...lanes.values()].map((items) => items.length));
  for (const [lane, items] of lanes)
    items.forEach((node, i) => {
      node.x = lane * 254;
      node.y = (i + (max - items.length) / 2) * 112;
    });
}

// Detail layout uses actual connections and disjoint islands, never independent
// rows for source/expression/output columns. No positions are written on viewing.
export function detailLayout(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id)),
    byId = new Map(nodes.map((node) => [node.id, node]));
  const relevant = edges.filter(
    (edge) => ids.has(edge.from) && ids.has(edge.to),
  );
  const neighbors = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of relevant) {
    neighbors.get(edge.from).push(edge.to);
    neighbors.get(edge.to).push(edge.from);
  }
  const visited = new Set(),
    result = new Map();
  let islandY = 0;
  for (const start of nodes) {
    if (visited.has(start.id)) continue;
    const island = [],
      queue = [start.id];
    visited.add(start.id);
    for (let at = 0; at < queue.length; at++) {
      const id = queue[at];
      island.push(id);
      for (const next of neighbors.get(id))
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
    }
    const ranks = new Map(),
      active = new Set();
    const rank = (id, depth = 0) => {
      if (ranks.has(id)) return ranks.get(id);
      if (active.has(id) || depth > 64) return 0;
      active.add(id);
      const value = Math.min(
        64,
        Math.max(
          -1,
          ...relevant
            .filter((edge) => edge.to === id)
            .map((edge) => rank(edge.from, depth + 1)),
        ) + 1,
      );
      active.delete(id);
      ranks.set(id, value);
      return value;
    };
    const columns = new Map();
    for (const id of island) {
      const column = rank(id);
      if (!columns.has(column)) columns.set(column, []);
      columns.get(column).push(byId.get(id));
    }
    const heights = [...columns.values()].map((items) =>
      items.reduce((sum, node) => sum + nodeHeight(node) + 32, 0),
    );
    const max = Math.max(...heights);
    for (const [column, items] of columns) {
      let y =
        islandY +
        (max - items.reduce((sum, node) => sum + nodeHeight(node) + 32, 0)) / 2;
      for (const node of items) {
        result.set(node.id, { x: column * 286, y });
        y += nodeHeight(node) + 32;
      }
    }
    islandY += max + 40;
  }
  return result;
}

export function detailMembers(graph, card) {
  const ids = new Set(card.activeMembers || card.members),
    incoming = new Map();
  for (const edge of graph.edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to).push(edge.from);
  }
  const queue = [...ids];
  for (let at = 0; at < queue.length; at++)
    for (const source of incoming.get(queue[at]) || [])
      if (!ids.has(source)) {
        ids.add(source);
        queue.push(source);
      }
  return ids;
}

// Route long connections through the gaps between cards. Parallel dependencies
// share a corridor, but receive separate tracks instead of coincident strokes.
export function summaryRoutes(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map(),
    used = new Map(),
    padding = 6;
  const intersects = (a, b, node) => {
    const left = node.x - padding,
      right = node.x + SUMMARY_WIDTH + padding;
    const top = node.y - padding,
      bottom = node.y + SUMMARY_HEIGHT + padding;
    if (a.x === b.x)
      return (
        a.x > left &&
        a.x < right &&
        Math.max(a.y, b.y) > top &&
        Math.min(a.y, b.y) < bottom
      );
    return (
      a.y > top &&
      a.y < bottom &&
      Math.max(a.x, b.x) > left &&
      Math.min(a.x, b.x) < right
    );
  };
  for (const [i, edge] of edges.entries()) {
    const from = byId.get(edge.from),
      to = byId.get(edge.to);
    const outs = edges.filter((item) => item.from === edge.from),
      ins = edges.filter((item) => item.to === edge.to);
    const back = to.x <= from.x;
    const start = {
      x: from.x + (back ? 0 : SUMMARY_WIDTH),
      y:
        from.y +
        20 +
        ((outs.indexOf(edge) + 1) * (SUMMARY_HEIGHT - 40)) / (outs.length + 1),
    };
    const end = {
      x: to.x + (back ? SUMMARY_WIDTH : 0),
      y:
        to.y +
        20 +
        ((ins.indexOf(edge) + 1) * (SUMMARY_HEIGHT - 40)) / (ins.length + 1),
    };
    if (!back && end.x - start.x < 100) {
      result.set(edge, {
        path: `M${start.x},${start.y} C${start.x + 30},${start.y} ${end.x - 30},${end.y} ${end.x},${end.y}`,
        points: [start, end],
      });
      continue;
    }
    const offset = 13 + (i % 7) * 2;
    const sx = start.x + (back ? -offset : offset),
      ex = end.x + (back ? offset : -offset);
    const ys = unique([
      start.y,
      end.y,
      ...nodes.flatMap((node) => [
        node.y - 8,
        node.y - 12,
        node.y - 16,
        node.y + SUMMARY_HEIGHT + 8,
        node.y + SUMMARY_HEIGHT + 12,
        node.y + SUMMARY_HEIGHT + 16,
      ]),
      Math.min(...nodes.map((node) => node.y)) - 28 - i * 3,
      Math.max(...nodes.map((node) => node.y + SUMMARY_HEIGHT)) + 28 + i * 3,
    ]);
    const valid = ys.filter((y) => {
      const a = { x: sx, y },
        b = { x: ex, y };
      return !nodes.some(
        (node) =>
          intersects({ x: sx, y: start.y }, a, node) ||
          intersects(a, b, node) ||
          intersects(b, { x: ex, y: end.y }, node),
      );
    });
    valid.sort(
      (a, b) =>
        Math.abs(a - start.y) +
        Math.abs(a - end.y) +
        (used.get(a) || 0) * 100 -
        (Math.abs(b - start.y) +
          Math.abs(b - end.y) +
          (used.get(b) || 0) * 100),
    );
    const y = valid[0] ?? Math.min(...nodes.map((node) => node.y)) - 40 - i * 3;
    used.set(y, (used.get(y) || 0) + 1);
    const points = [
      start,
      { x: sx, y: start.y },
      { x: sx, y },
      { x: ex, y },
      { x: ex, y: end.y },
      end,
    ];
    let path = `M${start.x},${start.y}`;
    for (let at = 1; at < points.length - 1; at++) {
      const before = points[at - 1],
        point = points[at],
        after = points[at + 1];
      const d1 = Math.hypot(point.x - before.x, point.y - before.y),
        d2 = Math.hypot(after.x - point.x, after.y - point.y),
        radius = Math.min(7, d1 / 2, d2 / 2);
      if (!radius) {
        path += ` L${point.x},${point.y}`;
        continue;
      }
      const ax = point.x + ((before.x - point.x) * radius) / d1,
        ay = point.y + ((before.y - point.y) * radius) / d1;
      const bx = point.x + ((after.x - point.x) * radius) / d2,
        by = point.y + ((after.y - point.y) * radius) / d2;
      path += ` L${ax},${ay} Q${point.x},${point.y} ${bx},${by}`;
    }
    path += ` L${end.x},${end.y}`;
    result.set(edge, { path, points });
  }
  return result;
}
