import * as V from "./vina-core.js";
import { effectiveProject } from "./vina-model.js";

// This graph compiles to native CustomVina declarations. It never executes JS.
export const NODE_TYPES = {
  event: {
    title: "交互事件",
    group: "事件",
    hint: "组件的点击或长按事件。点击可同时切换状态并执行一个原生动作。",
  },
  state: {
    title: "状态变量",
    group: "数据",
    hint: "实例会话状态；默认值支持布尔、数字、文本。",
  },
  reference: {
    title: "读取变量 / 悬停",
    group: "数据",
    hint: "读取完整变量路径，或组件的 hovered / hoverProgress。",
  },
  value: {
    title: "常量",
    group: "数据",
    hint: "输入 Vina 字面量，例如 true、180、rgb(82,121,251) 或带引号的文本。",
  },
  expression: {
    title: "表达式",
    group: "逻辑",
    hint: "用 ${a}、${b}、${c} 作为连线输入，也可直接引用完整变量路径。",
  },
  condition: {
    title: "条件分支",
    group: "逻辑",
    hint: "a 为条件，b 为成立时的值，c 为否则的值。",
  },
  bind: {
    title: "设置属性",
    group: "输出",
    hint: "将输入绑定到完整属性路径，支持 hover、hoverRegion 和动画属性。",
  },
  toggle: {
    title: "切换状态",
    group: "输出",
    hint: "连接点击事件，切换已声明的布尔 state 变量。",
  },
  action: {
    title: "原生动作",
    group: "输出",
    hint: "连接点击或长按事件，执行 CustomVina 标准动作。",
  },
};
const NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const PATH = /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)+$/u;
const INTERACTION = new Set([
  "transition",
  "unhoverTransition",
  "holdDelay",
  "pressDuration",
  "releaseDuration",
  "pressScale",
  "holdDuration",
  "holdScale",
  "holdOffset",
  "interaction",
  "hitPaddingX",
  "hitPaddingY",
]);
const SPECIAL = new Set(["action", "holdAction", "toggle"]);
const INPUTS = ["a", "b", "c"];
const isInput = (key) => INPUTS.includes(key) || /^in[1-9]\d*$/.test(key);
export const graphId = () => "b" + V.uid();

// Token-aware replacement leaves strings and comments untouched.
export function mapReferences(raw, map) {
  return raw.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\$\{([^}]+)\}/g,
    (token, ref) => (ref === undefined ? token : map(ref)),
  );
}
export function inputsOf(node) {
  if (node.type === "bind")
    return [{ key: "value", label: "属性值", kind: "data" }];
  if (["toggle", "action"].includes(node.type))
    return [{ key: "event", label: "执行", kind: "event" }];
  if (["expression", "condition"].includes(node.type)) {
    let refs;
    try {
      refs = new Set(V.references(V.parseExpression(node.code)));
    } catch {
      refs = new Set(INPUTS);
    }
    return [...refs].filter(isInput).map((key) => ({
      key,
      label:
        node.type === "condition"
          ? { a: "条件", b: "成立", c: "否则" }[key] || key
          : key,
      kind: "data",
    }));
  }
  return [];
}
export function outputOf(node) {
  return node.type === "event"
    ? "event"
    : ["state", "reference", "value", "expression", "condition"].includes(
          node.type,
        )
      ? "data"
      : null;
}
function checkPath(path, label = "路径") {
  if (typeof path !== "string" || path.length > 512 || !PATH.test(path))
    throw new Error(`${label}须为完整路径，例如 Card.view.width`);
  return path;
}
export function validateGraphShape(graph) {
  if (
    !graph ||
    graph.version !== 1 ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(graph.baseline) ||
    graph.nodes.length > 8192 ||
    graph.edges.length > 16384 ||
    graph.baseline.length > 8192
  )
    throw new Error("行为图格式错误或超出限制（8192 节点 / 16384 连线）");
  const nodes = new Map();
  for (const node of graph.nodes) {
    if (
      !node ||
      typeof node.id !== "string" ||
      !/^[\w-]{1,100}$/.test(node.id) ||
      nodes.has(node.id) ||
      !Object.hasOwn(NODE_TYPES, node.type) ||
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.y) ||
      Math.abs(node.x) > 100000 ||
      Math.abs(node.y) > 100000
    )
      throw new Error("行为节点标识、类型或位置无效");
    for (const key of [
      "path",
      "target",
      "code",
      "event",
      "action",
      "fallback",
      "component",
      "owner",
    ])
      if (
        node[key] !== undefined &&
        (typeof node[key] !== "string" || node[key].length > 16384)
      )
        throw new Error("行为节点字段无效或过长");
    nodes.set(node.id, node);
  }
  const occupied = new Set();
  for (const edge of graph.edges) {
    const source = nodes.get(edge.from),
      target = nodes.get(edge.to),
      port = target && inputsOf(target).find((p) => p.key === edge.port);
    if (
      !source ||
      !port ||
      !outputOf(source) ||
      port.kind !== outputOf(source) ||
      edge.from === edge.to ||
      occupied.has(edge.to + ":" + edge.port)
    )
      throw new Error("行为连线端口无效、重复或类型不匹配");
    occupied.add(edge.to + ":" + edge.port);
  }
  for (const item of graph.baseline) {
    checkPath(item.path);
    if (
      !["bind", "state", "event"].includes(item.kind) ||
      typeof item.fallback !== "string" ||
      item.fallback.length > 16384
    )
      throw new Error("行为图原始声明无效");
  }
  return graph;
}
export function connect(graph, from, to, port) {
  const next = V.clone(graph);
  next.edges = next.edges.filter((e) => e.to !== to || e.port !== port);
  next.edges.push({ from, to, port });
  validateGraphShape(next);
  const visiting = new Set(),
    done = new Set(),
    incoming = new Map();
  for (const edge of next.edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to).push(edge.from);
  }
  const visit = (id, depth = 0) => {
    if (visiting.has(id)) throw new Error("不能连接：行为图存在循环");
    if (depth > 64) throw new Error("行为连线不能超过 64 层");
    if (done.has(id)) return;
    visiting.add(id);
    for (const source of incoming.get(id) || []) visit(source, depth + 1);
    visiting.delete(id);
    done.add(id);
  };
  for (const node of next.nodes) visit(node.id);
  graph.edges = next.edges;
}
export function newNode(type, component = "", target = "", x = 0, y = 0) {
  if (!Object.hasOwn(NODE_TYPES, type)) throw new Error("未知行为节点");
  return {
    id: graphId(),
    type,
    component,
    x,
    y,
    ...(type === "event" ? { target, event: "click" } : {}),
    ...(type === "state"
      ? { path: component + ".state.expanded", code: "false" }
      : {}),
    ...(type === "reference"
      ? { path: target ? target + ".hoverProgress" : "pogget.isListView" }
      : {}),
    ...(type === "value" ? { code: "1" } : {}),
    ...(type === "expression" ? { code: "${a} * ${b}" } : {}),
    ...(type === "condition" ? { code: "${a} ? ${b} : ${c}" } : {}),
    ...(type === "bind"
      ? { path: target ? target + ".opacity" : "", fallback: "1" }
      : {}),
    ...(type === "toggle" ? { path: component + ".state.expanded" } : {}),
    ...(type === "action" ? { action: "pogget.action.view.toggle" } : {}),
  };
}
function ensureBlock(doc, path) {
  const parts = path.split(".");
  let members = doc.roots,
    node;
  for (const part of parts) {
    if (!NAME.test(part)) throw new Error("无效路径：" + path);
    node = members.find((n) => n.name === part);
    if (node?.kind === "property")
      throw new Error("不能把属性替换为块：" + path);
    if (!node) {
      node = V.makeBlock(part);
      members.push(node);
    }
    members = node.members;
  }
  return node;
}
function write(doc, path, raw) {
  checkPath(path);
  if (raw === null && !V.index(doc).byPath.has(path)) return;
  const at = path.lastIndexOf("."),
    node = ensureBlock(doc, path.slice(0, at));
  if (raw === null)
    node.members = node.members.filter((p) => p.name !== path.slice(at + 1));
  else V.setRaw(node, path.slice(at + 1), raw);
}
function fallback(runtime, path, raw) {
  try {
    return V.literal(runtime.get(path));
  } catch {
    return raw;
  }
}

export function createGraph(project, standard, inputs = {}) {
  const doc = effectiveProject(project, standard),
    idx = V.index(doc),
    runtime = new V.Runtime(doc, inputs);
  const saved = project.behaviorGraph;
  if (saved?.canonical === V.serialize(project.doc)) {
    try {
      validateGraphShape(saved.graph);
      // Source remains authoritative even when optional layout metadata is tampered.
      if (
        V.serialize(
          compileGraph(project, standard, saved.graph, inputs).doc,
        ) === saved.canonical
      )
        return V.clone(saved.graph);
    } catch {
      /* Rebuild safely from the native document. */
    }
  }
  const graph = { version: 1, nodes: [], edges: [], baseline: [] },
    sources = new Map(),
    rows = new Map();
  const add = (node, column) => {
    const key = node.component + ":" + column,
      row = rows.get(key) || 0;
    node.x = column * 290;
    node.y = row;
    rows.set(key, row + 128 + Math.max(1, inputsOf(node).length) * 26);
    graph.nodes.push(node);
    return node;
  };
  const source = (path) => {
    if (!sources.has(path))
      sources.set(
        path,
        add({ ...newNode("reference", path.split(".")[0]), path }, 0),
      );
    return sources.get(path);
  };
  const ownIndex = V.index(project.doc);
  for (const [path, p] of idx.byPath) {
    if (p.kind !== "property" || !/^[^.]+\.state\.[^.]+$/.test(path)) continue;
    const node = add(
      { ...newNode("state", path.split(".")[0]), path, code: p.raw },
      0,
    );
    sources.set(path, node);
    graph.baseline.push({
      kind: "state",
      path,
      fallback: p.raw,
      inherited: !ownIndex.byPath.has(path),
    });
  }
  for (const [path, p] of idx.byPath) {
    if (
      p.kind !== "property" ||
      /^[^.]+\.state\./.test(path) ||
      path.startsWith("Preset.")
    )
      continue;
    const component = path.split(".")[0],
      inView = path.includes(".view.");
    if (inView && SPECIAL.has(p.name)) continue;
    const expr = V.expressionOf(p),
      refs = V.references(expr);
    if (
      !refs.length &&
      !expr.op &&
      !(
        inView &&
        (INTERACTION.has(p.name) ||
          /\.(hover|hoverRegion|motion|animation)\./.test(path))
      )
    )
      continue;
    const rawFallback = fallback(runtime, path, p.raw);
    const out = add(
      { ...newNode("bind", component), path, fallback: rawFallback },
      2,
    );
    // Imported expressions retain their native reference spelling and scope.
    const unique = [...new Set(refs)];
    const mappings = new Map(
      unique.map((ref, i) => [ref, INPUTS[i] || "in" + (i + 1)]),
    );
    const calc = add(
      {
        ...newNode("expression", component),
        code: mapReferences(p.raw, (ref) => "${" + mappings.get(ref) + "}"),
        owner: path,
      },
      1,
    );
    for (const ref of unique)
      graph.edges.push({
        from: source(V.resolveReference(ref, path)).id,
        to: calc.id,
        port: mappings.get(ref),
      });
    graph.edges.push({ from: calc.id, to: out.id, port: "value" });
    graph.baseline.push({ kind: "bind", path, fallback: rawFallback });
  }
  for (const { node } of V.viewNodes(doc)) {
    const target = idx.paths.get(node.id),
      component = target.split(".")[0];
    for (const [event, keys] of [
      ["click", ["toggle", "action"]],
      ["hold", ["holdAction"]],
    ]) {
      const present = keys.filter((key) => V.property(node, key));
      if (!present.length) continue;
      const trigger = add({ ...newNode("event", component, target), event }, 0);
      for (const key of present) {
        const p = V.property(node, key),
          path = target + "." + key;
        let value;
        try {
          value = runtime.get(path);
        } catch {
          value = "";
        }
        if (
          (typeof value !== "string" || !value) &&
          !(
            key !== "toggle" &&
            (V.references(V.expressionOf(p)).length || V.expressionOf(p).op)
          )
        )
          continue;
        const out = add(
          key === "toggle"
            ? {
                ...newNode("toggle", component),
                path: V.resolveReference(value, path),
              }
            : { ...newNode("action", component), action: value, code: p.raw },
          1,
        );
        graph.edges.push({ from: trigger.id, to: out.id, port: "event" });
        graph.baseline.push({ kind: "event", path, fallback: '""' });
      }
    }
  }
  return validateGraphShape(graph);
}

export function compileGraph(
  project,
  standard,
  graph,
  inputs = {},
  schema = {},
) {
  validateGraphShape(graph);
  const next = V.clone(project),
    effective = effectiveProject(project, standard),
    idx = V.index(effective);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n])),
    incoming = new Map(graph.edges.map((e) => [e.to + ":" + e.port, e.from]));
  const writes = new Map(),
    visiting = new Set(),
    cache = new Map();
  const basePaths = V.index(
    effectiveProject(
      {
        ...project,
        doc: { roots: project.doc.roots.filter((n) => n.name === "Preset") },
      },
      standard,
    ),
  ).byPath;
  const set = (path, raw) => {
    checkPath(path);
    if (writes.has(path)) throw new Error("多个节点同时写入：" + path);
    writes.set(path, raw);
  };
  const value = (id, depth = 0) => {
    if (depth > 64 || visiting.has(id))
      throw new Error("行为图存在循环或超过 64 层");
    if (cache.has(id)) return cache.get(id);
    const node = nodes.get(id);
    if (!node || outputOf(node) !== "data") throw new Error("数据来源无效");
    visiting.add(id);
    let raw;
    if (node.type === "state" || node.type === "reference")
      raw = "${" + checkPath(node.path, "变量路径") + "}";
    else {
      if (!node.code?.trim()) throw new Error("表达式不能为空");
      V.parseExpression(node.code);
      raw = mapReferences(node.code, (ref) => {
        if (isInput(ref)) {
          const from = incoming.get(id + ":" + ref);
          if (!from)
            throw new Error(`表达式 ${node.id} 的输入 ${ref} 尚未连接`);
          return "(" + value(from, depth + 1) + ")";
        }
        return (
          "${" +
          V.resolveReference(
            ref,
            node.owner || node.component + ".view.value",
          ) +
          "}"
        );
      });
    }
    if (raw.length > 65536)
      throw new Error("展开后的表达式过长，请减少重复连接");
    V.parseExpression(raw);
    visiting.delete(id);
    cache.set(id, raw);
    return raw;
  };
  const views = new Set(
    V.viewNodes(effective).map(({ node }) => idx.paths.get(node.id)),
  );
  for (const node of graph.nodes) {
    if (node.type === "state") {
      checkPath(node.path, "状态路径");
      if (
        !/^[^.]+\.state\.[^.]+$/.test(node.path) ||
        !idx.byPath.has(node.path.split(".")[0])
      )
        throw new Error("状态须声明在已有组件的 state 中");
      const expr = V.parseExpression(node.code);
      if (
        !("value" in expr) &&
        !(expr.op === "-u" && typeof expr.args[0]?.value === "number")
      )
        throw new Error("状态默认值必须为布尔、有限数字或文本字面量");
      set(node.path, node.code);
    } else if (node.type === "bind") {
      const from = incoming.get(node.id + ":value");
      if (!from) continue;
      checkPath(node.path, "目标属性");
      if (
        SPECIAL.has(node.path.split(".").at(-1)) ||
        node.path.includes(".state.") ||
        node.path.startsWith("pogget.") ||
        node.path.startsWith("Preset.") ||
        /\.(hovered|hoverProgress)$/.test(node.path)
      )
        throw new Error("此属性不可绑定，请使用相应的事件或状态节点");
      const owner = node.path.slice(0, node.path.lastIndexOf("."));
      if (
        !idx.byPath.has(owner) &&
        ![...views].some((p) => owner.startsWith(p + "."))
      )
        throw new Error("目标组件或属性块不存在：" + owner);
      set(node.path, value(from));
    } else if (node.type === "action" || node.type === "toggle") {
      const from = incoming.get(node.id + ":event");
      if (!from) continue;
      const event = nodes.get(from);
      if (!views.has(event.target) || !["click", "hold"].includes(event.event))
        throw new Error("事件须指向已有绘制节点");
      if (node.type === "toggle") {
        if (event.event !== "click")
          throw new Error("CustomVina 仅支持点击切换状态");
        checkPath(node.path, "状态路径");
        if (!/^[^.]+\.state\.[^.]+$/.test(node.path))
          throw new Error("切换目标必须为布尔 state 变量");
        set(event.target + ".toggle", V.literal(node.path));
      } else {
        const raw = node.code || V.literal(node.action);
        if (
          !node.code &&
          schema.actions?.length &&
          !schema.actions.includes(node.action)
        )
          throw new Error("未知的原生动作");
        V.parseExpression(raw);
        set(
          event.target + (event.event === "hold" ? ".holdAction" : ".action"),
          raw,
        );
      }
    }
  }
  for (const base of graph.baseline) {
    if (writes.has(base.path)) continue;
    if (base.kind === "state") {
      if (!base.inherited) write(next.doc, base.path, null);
    } else if (base.kind === "event" && base.path.endsWith(".toggle")) {
      if (basePaths.has(base.path))
        throw new Error(
          "基础预设的 toggle 不能通过增量覆盖删除，请先导出独立预设后编辑。",
        );
      write(next.doc, base.path, null);
    } else
      writes.set(
        base.path,
        graph.nodes.find((n) => n.type === "bind" && n.path === base.path)
          ?.fallback || base.fallback,
      );
  }
  // Avoid needless inherited overrides and preserve the original source spelling.
  const normalized = (expr, path) =>
    "ref" in expr
      ? { ref: V.resolveReference(expr.ref, path) }
      : expr.args
        ? { ...expr, args: expr.args.map((arg) => normalized(arg, path)) }
        : expr;
  for (const [path, raw] of writes) {
    const existing = idx.byPath.get(path);
    if (existing?.raw === raw) continue;
    // Equivalence is deliberately syntax-based, never only current-value based.
    if (
      existing &&
      JSON.stringify(normalized(V.expressionOf(existing), path)) ===
        JSON.stringify(normalized(V.parseExpression(raw), path))
    )
      continue;
    if (existing && path.endsWith(".toggle")) {
      const before = V.expressionOf(existing),
        after = V.parseExpression(raw);
      if (
        typeof before.value === "string" &&
        typeof after.value === "string" &&
        V.resolveReference(before.value, path) ===
          V.resolveReference(after.value, path)
      )
        continue;
    }
    write(next.doc, path, raw);
  }
  const rt = new V.Runtime(effectiveProject(next, standard), inputs);
  rt.validateReferences();
  for (const node of graph.nodes.filter(
    (n) => n.type === "toggle" && incoming.has(n.id + ":event"),
  ))
    if (typeof rt.get(node.path) !== "boolean")
      throw new Error("切换目标必须为布尔 state 变量：" + node.path);
  const stored = V.clone(graph),
    baseline = new Map();
  for (const node of graph.nodes) {
    if (node.type === "state")
      baseline.set(node.path, {
        kind: "state",
        path: node.path,
        fallback: node.code,
        inherited:
          graph.baseline.find((b) => b.kind === "state" && b.path === node.path)
            ?.inherited || false,
      });
    if (node.type === "bind" && incoming.has(node.id + ":value"))
      baseline.set(node.path, {
        kind: "bind",
        path: node.path,
        fallback: node.fallback || "1",
      });
    if (
      ["toggle", "action"].includes(node.type) &&
      incoming.has(node.id + ":event")
    ) {
      const event = nodes.get(incoming.get(node.id + ":event"));
      const path =
        event.target +
        (node.type === "toggle"
          ? ".toggle"
          : event.event === "hold"
            ? ".holdAction"
            : ".action");
      baseline.set(path, { kind: "event", path, fallback: '""' });
    }
  }
  stored.baseline = [...baseline.values()];
  next.behaviorGraph = { canonical: V.serialize(next.doc), graph: stored };
  return next;
}
