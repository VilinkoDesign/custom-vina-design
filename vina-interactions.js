import * as V from "./vina-core.js";
import { effectiveProject } from "./vina-model.js";

// Inspector controls author the same native state/toggle/expressions as the graph.
export const INTERACTION_PROPERTIES = [
  { key: "visible", label: "可见", kind: "boolean", off: false, on: true },
  { key: "enabled", label: "可交互", kind: "boolean", off: false, on: true },
  { key: "opacity", label: "透明度", kind: "number", off: 0, on: 1 },
  { key: "width", label: "宽度", kind: "number", off: 120, on: 240 },
  { key: "height", label: "高度", kind: "number", off: 40, on: 80 },
  { key: "x", label: "X", kind: "number", off: 0, on: 20 },
  { key: "y", label: "Y", kind: "number", off: 0, on: 20 },
  { key: "radius", label: "圆角", kind: "number", off: 0, on: 12 },
  {
    key: "background",
    label: "背景颜色",
    kind: "color",
    off: 0x666666,
    on: 0xfb7952,
  },
  {
    key: "color",
    label: "文字颜色",
    kind: "color",
    off: 0xaaaaaa,
    on: 0xffffff,
  },
  { key: "fillOpacity", label: "填充透明度", kind: "number", off: 0.5, on: 1 },
  { key: "borderOpacity", label: "边框透明度", kind: "number", off: 0, on: 1 },
  { key: "label", label: "文字", kind: "string", off: "关闭", on: "开启" },
];
const NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const statePath = (path) => /^[^.]+\.state\.[^.]+$/.test(path);

export function booleanStates(doc) {
  const runtime = new V.Runtime(doc);
  return [...runtime.idx.byPath]
    .filter(
      ([path, p]) =>
        p.kind === "property" &&
        statePath(path) &&
        typeof runtime.get(path) === "boolean",
    )
    .map(([path]) => path);
}

export function createBooleanState(
  project,
  standard,
  component,
  name,
  initial = false,
) {
  if (!NAME.test(name) || typeof initial !== "boolean")
    throw new Error("开关名称需为字母、汉字、数字或下划线，且不能以数字开头");
  const root = project.doc.roots.find((node) => node.name === component);
  if (!root || root.name === "Preset") throw new Error("请选择已有组件");
  const path = `${component}.state.${name}`;
  if (path.length > 512) throw new Error("开关变量路径不能超过 512 个字符");
  if (V.index(effectiveProject(project, standard)).byPath.has(path))
    throw new Error("此变量已存在，请使用其他名称");
  let state = V.block(root, "state");
  if (!state) root.members.push((state = V.makeBlock("state")));
  V.setValue(state, name, initial);
  return path;
}

export function setClickToggle(project, standard, id, target) {
  const node = V.index(project.doc).byId.get(id);
  if (!node || !V.viewNodes(project.doc).some((entry) => entry.node.id === id))
    throw new Error("目标组件不存在");
  if (target) {
    if (!booleanStates(effectiveProject(project, standard)).includes(target))
      throw new Error("点击切换须选择已声明的布尔 state 变量");
    V.setValue(node, "toggle", target);
  } else {
    const members = node.members;
    node.members = members.filter((member) => member.name !== "toggle");
    const inherited = V.index(effectiveProject(project, standard)).byPath.get(
      V.index(project.doc).paths.get(id) + ".toggle",
    );
    if (inherited) {
      node.members = members;
      throw new Error("此点击切换继承自基础预设；请先导出独立预设再移除");
    }
  }
}

export function setBooleanDefault(project, standard, path, value) {
  if (
    !booleanStates(effectiveProject(project, standard)).includes(path) ||
    typeof value !== "boolean"
  )
    throw new Error("请选择有效的布尔开关变量");
  const [component, , name] = path.split(".");
  let root = project.doc.roots.find((node) => node.name === component);
  if (!root) project.doc.roots.push((root = V.makeBlock(component)));
  let state = V.block(root, "state");
  if (!state) root.members.push((state = V.makeBlock("state")));
  V.setValue(state, name, value);
}

function expressionText(expr, owner) {
  if ("value" in expr) return V.literal(expr.value);
  if ("ref" in expr) return "${" + V.resolveReference(expr.ref, owner) + "}";
  const args = expr.args.map((item) => expressionText(item, owner));
  if (expr.op === "?:") return `(${args[0]} ? ${args[1]} : ${args[2]})`;
  if (["!u", "+u", "-u"].includes(expr.op)) return `${expr.op[0]}(${args[0]})`;
  if (
    [
      "+",
      "-",
      "*",
      "/",
      "%",
      ">",
      "<",
      ">=",
      "<=",
      "==",
      "!=",
      "&&",
      "||",
    ].includes(expr.op)
  )
    return `(${args[0]} ${expr.op} ${args[1]})`;
  return `${expr.op}(${args.join(", ")})`;
}

export function interactionBinding(doc, node, key) {
  if (!node) return null;
  const p = V.property(node, key);
  if (!p) return null;
  const index = V.index(doc),
    owner = index.paths.get(node.id) + "." + key;
  const expr = V.expressionOf(p);
  let condition = expr,
    on = "true",
    off = "false";
  if (expr.op === "?:") {
    [condition] = expr.args;
    on = expressionText(expr.args[1], owner);
    off = expressionText(expr.args[2], owner);
  } else if (expr.op === "!u") {
    [condition] = expr.args;
    on = "false";
    off = "true";
  }
  if (!("ref" in condition)) return null;
  const source = V.resolveReference(condition.ref, owner);
  const declaration = index.byPath.get(source);
  const kind =
    statePath(source) &&
    declaration?.kind === "property" &&
    typeof V.expressionOf(declaration).value === "boolean"
      ? "state"
      : source.endsWith(".hovered") && index.byPath.has(source.slice(0, -8))
        ? "hover"
        : null;
  return kind ? { key, kind, source, on, off } : null;
}

export function bindInteraction(
  project,
  standard,
  id,
  config,
  inputs = {},
  schema = {},
) {
  const own = V.index(project.doc),
    node = own.byId.get(id),
    doc = effectiveProject(project, standard),
    runtime = new V.Runtime(doc, inputs),
    def = INTERACTION_PROPERTIES.find((item) => item.key === config.key);
  if (!node || !def) throw new Error("请选择有效的目标属性");
  const path = own.paths.get(id);
  if (!V.viewNodes(project.doc).some((entry) => entry.node.id === id))
    throw new Error("目标须为绘制组件");
  if (config.kind === "state") {
    if (!booleanStates(doc).includes(config.source))
      throw new Error("请选择布尔开关变量");
  } else if (config.kind === "hover") {
    const sourceView = config.source.replace(/\.hovered$/, "");
    if (
      sourceView === config.source ||
      !V.viewNodes(doc).some(
        ({ node }) => runtime.idx.paths.get(node.id) === sourceView,
      )
    )
      throw new Error("请选择有效的悬停来源组件");
  } else throw new Error("未知交互来源");
  for (const raw of [config.off, config.on]) {
    const value = V.evaluateExpression(V.parseExpression(raw), (ref) =>
      runtime.get(V.resolveReference(ref, path + "." + config.key)),
    );
    if (
      def.kind === "boolean"
        ? typeof value !== "boolean"
        : def.kind === "string"
          ? typeof value !== "string"
          : typeof value !== "number" || !Number.isFinite(value)
    )
      throw new Error(def.label + "的两个状态值类型不正确");
    if (
      def.kind === "color" &&
      (!Number.isInteger(value) || value < 0 || value > 0xffffff)
    )
      throw new Error("请输入有效的颜色");
    const bounds = schema.bounds?.[config.key];
    if (bounds && (value < bounds[0] || value > bounds[1]))
      throw new Error(`${def.label}范围为 ${bounds.join("..")}`);
  }
  const ref = "${" + config.source + "}";
  V.setRaw(
    node,
    config.key,
    config.on === "true" && config.off === "false"
      ? ref
      : config.on === "false" && config.off === "true"
        ? "!" + ref
        : `${ref} ? (${config.on}) : (${config.off})`,
  );
}
