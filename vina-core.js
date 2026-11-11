// The editor owns syntax, not a lossy list of paint attributes. No eval/Function.
export const META = new Set([
  "hover",
  "pressed",
  "shadow",
  "border",
  "background",
  "variants",
  "animation",
  "motion",
  "repeat",
  "editor",
  "textLayout",
  "gridLayout",
  "previewLayout",
  "hostLayout",
  "hoverRegion",
  "backgroundGradient",
  "borderGradient",
]);
export const TYPES = [
  "rect",
  "solid",
  "glass",
  "text",
  "icon",
  "image",
  "button",
  "group",
  "path",
  "content",
  "container",
  "rectangle",
  "pogget.native.Header",
  "pogget.native.Background",
  "pogget.native.Tag",
  "pogget.native.VinaIcon",
  "pogget.native.Behavior",
];
const ARITY = {
  min: 2,
  max: 2,
  clamp: 3,
  abs: 1,
  floor: 1,
  trunc: 1,
  f32: 1,
  ceil: 1,
  round: 1,
  sqrt: 1,
  pow: 2,
  hypot: 2,
  rgb: 3,
  fade: 2,
  red: 1,
  green: 1,
  blue: 1,
  average: 1,
};
let sequence = 0;
export const uid = () => "n" + ++sequence;
export const clone = (value) => structuredClone(value);
export const literal = (value) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);
export class VinaError extends Error {
  constructor(message, source = "", offset = 0) {
    const prefix = source.slice(0, offset).split("\n");
    super(`${message} (${prefix.length}:${prefix.at(-1).length + 1})`);
    this.name = "VinaError";
    this.offset = offset;
  }
}
class Reader {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.count = 0;
    this.blocks = 0;
    this.props = 0;
  }
  fail(message) {
    throw new VinaError(message, this.source, this.pos);
  }
  space() {
    const start = this.pos;
    for (;;) {
      while (
        /\s|\uFEFF/.test(this.source[this.pos] || "") &&
        this.pos < this.source.length
      )
        this.pos++;
      if (this.source.startsWith("//", this.pos)) {
        while (this.pos < this.source.length && this.source[this.pos] !== "\n")
          this.pos++;
      } else if (this.source.startsWith("/*", this.pos)) {
        const end = this.source.indexOf("*/", this.pos + 2);
        if (end < 0) this.fail("注释未闭合");
        this.pos = end + 2;
      } else break;
    }
    return this.source.slice(start, this.pos).trim();
  }
  take(token) {
    this.space();
    if (!this.source.startsWith(token, this.pos)) return false;
    this.pos += token.length;
    return true;
  }
  require(token) {
    if (!this.take(token)) this.fail(`需要 ${token}`);
  }
  name() {
    this.space();
    const match = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(this.source.slice(this.pos));
    if (!match) this.fail("需要成员名称");
    this.pos += match[0].length;
    return match[0];
  }
  string() {
    this.space();
    const quote = this.source[this.pos++];
    let result = "";
    while (this.pos < this.source.length) {
      let c = this.source[this.pos++];
      if (c === quote) return result;
      if (c === "\\") {
        c = this.source[this.pos++];
        if (c === "u") {
          const hex = this.source.slice(this.pos, this.pos + 4);
          if (!/^[\da-f]{4}$/i.test(hex)) this.fail("无效 Unicode 转义");
          result += String.fromCharCode(parseInt(hex, 16));
          this.pos += 4;
          continue;
        }
        if (!["n", "r", "t", "\\", '"', "'"].includes(c))
          this.fail("无效字符串转义");
        c = { n: "\n", r: "\r", t: "\t" }[c] ?? c;
      }
      result += c;
    }
    this.fail("字符串未闭合");
  }
  expression(depth = 0, minimum = 0) {
    if (depth > 64) this.fail("表达式嵌套超过 64 层");
    this.space();
    let left;
    const c = this.source[this.pos];
    if (["!", "-", "+"].includes(c)) {
      this.pos++;
      left = { op: c + "u", args: [this.expression(depth + 1, 6)] };
    } else if (this.take("(")) {
      left = this.expression(depth + 1);
      this.require(")");
    } else if (this.take("${")) {
      const end = this.source.indexOf("}", this.pos),
        ref = this.source.slice(this.pos, end);
      if (end < 0 || !ref || /[\s${]/.test(ref)) this.fail("无效变量引用");
      this.pos = end + 1;
      left = { ref };
    } else if (c === '"' || c === "'") left = { value: this.string() };
    else if (/[\d.]/.test(c || "")) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
        this.source.slice(this.pos),
      );
      if (!match) this.fail("无效数字");
      this.pos += match[0].length;
      let value = Number(match[0]);
      const invalidLiteral =
        !Number.isFinite(value) ||
        (value === 0 && /[1-9]/.test(match[0].split(/[eE]/)[0]));
      if (this.source.startsWith("ms", this.pos)) {
        value /= 1000;
        this.pos += 2;
      }
      if (invalidLiteral) this.fail("数字必须在有限双精度范围内");
      left = { value };
    } else {
      const name = this.name();
      if (name === "true" || name === "false")
        left = { value: name === "true" };
      else if (name === "pi") left = { value: Math.PI };
      else if (this.take("(")) {
        if (!Object.hasOwn(ARITY, name)) this.fail(`未知函数 ${name}`);
        const args = [];
        for (let i = 0; i < ARITY[name]; i++) {
          if (i) this.require(",");
          args.push(this.expression(depth + 1));
        }
        this.require(")");
        left = { op: name, args };
      } else left = { value: name };
    }
    if (++this.count > 512) this.fail("表达式指令超过 512 条");
    const precedence = {
      "||": 1,
      "&&": 2,
      "==": 3,
      "!=": 3,
      "<": 3,
      ">": 3,
      "<=": 3,
      ">=": 3,
      "+": 4,
      "-": 4,
      "*": 5,
      "/": 5,
      "%": 5,
    };
    for (;;) {
      this.space();
      const op = /^(?:\|\||&&|==|!=|<=|>=|[<>+*/%\-])/.exec(
        this.source.slice(this.pos),
      )?.[0];
      if (!op || precedence[op] < minimum) break;
      this.pos += op.length;
      left = {
        op,
        args: [left, this.expression(depth + 1, precedence[op] + 1)],
      };
      if (++this.count > 512) this.fail("表达式指令超过 512 条");
    }
    if (minimum === 0 && this.take("?")) {
      const yes = this.expression(depth + 1);
      this.require(":");
      left = { op: "?:", args: [left, yes, this.expression(depth + 1)] };
    }
    return left;
  }
  block(name, depth = 0, leading = "") {
    if (depth > 32 || ++this.blocks > 4096) this.fail("块数量或嵌套超过上限");
    this.require("{");
    const node = { kind: "block", id: uid(), name, members: [], leading };
    const names = new Set();
    for (;;) {
      const prefix = this.space();
      if (this.take("}")) {
        node.trailing = prefix;
        break;
      }
      const key = this.name();
      if (names.has(key)) this.fail(`重复成员 ${key}`);
      names.add(key);
      this.space();
      if (this.source[this.pos] === "{")
        node.members.push(this.block(key, depth + 1, prefix));
      else {
        this.require(":");
        this.space();
        const start = this.pos;
        this.count = 0;
        this.expression();
        node.members.push({
          kind: "property",
          id: uid(),
          name: key,
          raw: this.source.slice(start, this.pos).trim(),
          leading: prefix,
        });
        if (++this.props > 32768) this.fail("属性超过 32768 项");
      }
      const suffix = this.space();
      if (this.take("}")) {
        node.trailing = suffix;
        break;
      }
      this.require(",");
    }
    return node;
  }
}
const expressions = new WeakMap();
export function parseExpression(raw) {
  const reader = new Reader(raw);
  const result = reader.expression();
  reader.space();
  if (reader.pos !== raw.length) reader.fail("表达式存在多余内容");
  return result;
}
export function parse(source) {
  if (
    typeof source !== "string" ||
    source.length > 1048576 ||
    source.includes("\0")
  )
    throw new Error("源码应为不含 NUL 的 UTF-8 文本，最多 1M 字符");
  const reader = new Reader(source),
    roots = [],
    names = new Set();
  for (;;) {
    const leading = reader.space();
    if (reader.pos === source.length) return { roots, trailing: leading };
    if (reader.take(",") || reader.take(";")) continue;
    const name = reader.name();
    if (names.has(name)) reader.fail(`重复组件 ${name}`);
    names.add(name);
    roots.push(reader.block(name, 0, leading));
  }
}
export function serialize(doc) {
  const emit = (node, depth) => {
    const pad = "  ".repeat(depth),
      comment = node.leading ? node.leading + "\n" : "";
    if (node.kind === "property")
      return (
        comment +
        `${pad}${node.name}: ${node.raw}${/\/\/[^\n]*$/.test(node.raw) ? "\n" + pad : ""}`
      );
    const body = node.members.map((m) => emit(m, depth + 1)).join(",\n");
    return (
      comment +
      `${pad}${node.name} {${body ? "\n" + body + "\n" : ""}${node.trailing ? node.trailing + "\n" : ""}${body ? pad : ""}}`
    );
  };
  return (
    doc.roots.map((n) => emit(n, 0)).join("\n\n") +
    (doc.trailing ? "\n" + doc.trailing : "") +
    "\n"
  );
}
export const property = (node, key) =>
  node?.members.find((m) => m.kind === "property" && m.name === key);
export const block = (node, key) =>
  node?.members.find((m) => m.kind === "block" && m.name === key);
export function setRaw(node, key, raw) {
  parseExpression(raw);
  const p = property(node, key);
  if (p) {
    p.raw = raw;
    expressions.delete(p);
    return p;
  }
  const member = { kind: "property", id: uid(), name: key, raw };
  node.members.push(member);
  return member;
}
export const setValue = (node, key, value) => setRaw(node, key, literal(value));
export function makeBlock(name, props = {}, children = []) {
  return {
    kind: "block",
    id: uid(),
    name,
    members: [
      ...Object.entries(props).map(([key, value]) => ({
        kind: "property",
        id: uid(),
        name: key,
        raw: literal(value),
      })),
      ...children,
    ],
  };
}
export function index(doc) {
  const byId = new Map(),
    byPath = new Map(),
    parents = new Map(),
    paths = new Map();
  const visit = (node, parent, path) => {
    byId.set(node.id, node);
    byPath.set(path, node);
    paths.set(node.id, path);
    parents.set(node.id, parent);
    if (node.kind === "block")
      for (const m of node.members) visit(m, node, path + "." + m.name);
  };
  for (const root of doc.roots) visit(root, null, root.name);
  return { byId, byPath, parents, paths };
}
export function resolveReference(ref, owner) {
  const component = owner.split(".")[0];
  let scope = owner.slice(0, owner.lastIndexOf("."));
  if (scope.endsWith(".hover")) scope = scope.slice(0, -6);
  if (ref.startsWith("self.") || ref.startsWith("view."))
    return scope + "." + ref.slice(5).replace(/\.value$/, "");
  if (ref.startsWith("parent."))
    return (
      scope.slice(0, scope.lastIndexOf(".")) +
      "." +
      ref.slice(7).replace(/\.value$/, "")
    );
  if (/^(ui|vars|state)\./.test(ref)) return component + "." + ref;
  return ref;
}
export function compose(doc, base) {
  const directive = doc.roots.find((r) => r.name === "Preset");
  if (!directive) return doc;
  if (directive.members.length !== 1 || !property(directive, "dependsOn"))
    throw new Error("Preset 只能声明 dependsOn");
  const dependency = parseExpression(property(directive, "dependsOn").raw);
  if (typeof dependency.value !== "string" || !dependency.value.trim())
    throw new Error("dependsOn 必须为非空字符串");
  if (!base)
    throw new Error(
      `缺少基础预设 ${dependency.value}，请导入对应的独立基础文件`,
    );
  if (base.roots.some((r) => r.name === "Preset"))
    throw new Error("基础预设必须独立，不能包含依赖链");
  const effective = clone(base);
  const merge = (target, source) => {
    for (const member of source.members) {
      const n = target.members.findIndex((m) => m.name === member.name);
      if (n < 0) target.members.push(clone(member));
      else if (target.members[n].kind !== member.kind)
        throw new Error(`属性与块不能互换：${member.name}`);
      else if (member.kind === "property") target.members[n] = clone(member);
      else {
        const oldId = target.members[n].id;
        merge(target.members[n], member);
        target.members[n].id = member.id;
        target.members[n].inheritedId = oldId;
      }
    }
  };
  for (const root of doc.roots.filter((r) => r.name !== "Preset")) {
    const target = effective.roots.find((r) => r.name === root.name);
    if (target) {
      merge(target, root);
      target.id = root.id;
    } else effective.roots.push(clone(root));
  }
  return effective;
}
const number = (value) => {
  if (typeof value === "boolean") return +value;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("需要有限数值");
  return value;
};
function color(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff)
    throw new Error("颜色必须为 COLORREF 整数");
  return value;
}
const finite = (result) => {
  if (typeof result === "number" && !Number.isFinite(result))
    throw new Error("表达式结果不是有限数值");
  return result;
};
function nativeText(value) {
  if (typeof value !== "number") return String(value);
  // Native Text uses std::to_wstring(double): six places, ties to even.
  // Quantize the actual binary value so half values and large numbers match CRT.
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, value);
  const bits = data.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponent ? fraction + (1n << 52n) : fraction;
  const power = exponent ? exponent - 1023 - 52 : -1074;
  let numerator = mantissa * 1000000n;
  let denominator = 1n;
  if (power >= 0) numerator <<= BigInt(power);
  else denominator <<= BigInt(-power);
  let quantized = numerator / denominator;
  const remainder = numerator % denominator;
  if (
    remainder * 2n > denominator ||
    (remainder * 2n === denominator && quantized % 2n === 1n)
  )
    quantized++;
  const digits = quantized.toString().padStart(7, "0");
  const text =
    (bits >> 63n ? "-" : "") + digits.slice(0, -6) + "." + digits.slice(-6);
  return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
export function evaluateExpression(
  expr,
  reference = () => {
    throw new Error("变量不可用");
  },
) {
  if ("value" in expr) return expr.value;
  if ("ref" in expr) return reference(expr.ref);
  // Native Vina evaluates both branches and both logical operands eagerly.
  const args = expr.args.map((a) => evaluateExpression(a, reference));
  const [a, b, c] = args;
  switch (expr.op) {
    case "?:":
      return a ? b : c;
    case "!u":
      return !a;
    case "+u":
      return a;
    case "-u":
      return -number(a);
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "&&":
      return !!a && !!b;
    case "||":
      return !!a || !!b;
    case "+":
      return typeof a === "string" || typeof b === "string"
        ? nativeText(a) + nativeText(b)
        : finite(number(a) + number(b));
    case "-":
      return finite(number(a) - number(b));
    case "*":
      return finite(number(a) * number(b));
    case "/":
    case "%":
      if (number(b) === 0) throw new Error("除数为零");
      return finite(
        expr.op === "/" ? number(a) / number(b) : number(a) % number(b),
      );
    case "<":
      return number(a) < number(b);
    case ">":
      return number(a) > number(b);
    case "<=":
      return number(a) <= number(b);
    case ">=":
      return number(a) >= number(b);
    case "min":
      return Math.min(number(a), number(b));
    case "max":
      return Math.max(number(a), number(b));
    case "clamp":
      if (number(b) > number(c)) throw new Error("clamp 范围无效");
      return Math.min(number(c), Math.max(number(b), number(a)));
    case "abs":
      return Math.abs(number(a));
    case "floor":
      return Math.floor(number(a));
    case "ceil":
      return Math.ceil(number(a));
    case "round":
      return Math.sign(number(a)) * Math.floor(Math.abs(a) + 0.5);
    case "trunc":
      return Math.trunc(number(a));
    case "f32":
      return finite(Math.fround(number(a)));
    case "sqrt":
      return finite(Math.sqrt(number(a)));
    case "pow":
      return finite(Math.pow(number(a), number(b)));
    case "hypot":
      return finite(Math.hypot(number(a), number(b)));
    case "rgb":
      return args
        .map((v) => Math.trunc(Math.max(0, Math.min(255, number(v)))))
        .reduce((sum, v, i) => sum | (v << (i * 8)), 0);
    case "red":
      return color(number(a)) & 255;
    case "green":
      return (color(number(a)) >> 8) & 255;
    case "blue":
      return (color(number(a)) >> 16) & 255;
    case "average": {
      const n = color(number(a));
      return ((n & 255) + ((n >> 8) & 255) + ((n >> 16) & 255)) / 3;
    }
    case "fade": {
      const n = color(number(a)),
        amount = number(b);
      if (Math.abs(amount) > 255) throw new Error("fade 范围为 -255..255");
      const channels = [n & 255, (n >> 8) & 255, (n >> 16) & 255];
      const delta =
        Math.trunc(amount) *
        (Math.trunc(channels.reduce((x, y) => x + y, 0) / 3) > 128 ? -1 : 1);
      return channels.reduce(
        (sum, v, i) => sum | (Math.max(0, Math.min(255, v + delta)) << (8 * i)),
        0,
      );
    }
    default:
      throw new Error(`不支持的运算 ${expr.op}`);
  }
}
export function expressionOf(p) {
  const cached = expressions.get(p);
  if (cached?.raw === p.raw) return cached.expr;
  const expr = parseExpression(p.raw);
  expressions.set(p, { raw: p.raw, expr });
  return expr;
}
export function references(expr) {
  return "ref" in expr ? [expr.ref] : expr.args?.flatMap(references) || [];
}
export class Runtime {
  constructor(doc, inputs = {}) {
    this.doc = doc;
    this.idx = index(doc);
    this.inputs = inputs;
    this.cache = new Map();
    this.active = new Set();
    this.aliases = new Map();
    for (const [path, p] of this.idx.byPath)
      if (p.kind === "property" && /\.ui\..+\.default$/.test(path))
        this.aliases.set(path.replace(/\.default$/, ".value"), path);
  }
  get(path, fallback) {
    if (Object.hasOwn(this.inputs, path)) return this.inputs[path];
    path = this.aliases.get(path) || path;
    if (this.cache.has(path)) return this.cache.get(path);
    const p = this.idx.byPath.get(path);
    if (!p || p.kind !== "property") {
      if (path.endsWith(".hovered")) return false;
      if (path.endsWith(".hoverProgress")) return 0;
      if (arguments.length > 1) return fallback;
      throw new Error(`变量不可用：${path}`);
    }
    if (this.active.has(path)) throw new Error(`循环引用：${path}`);
    if (this.active.size > 64) throw new Error("变量引用超过 64 层");
    this.active.add(path);
    try {
      const result = evaluateExpression(expressionOf(p), (ref) =>
        this.get(resolveReference(ref, path)),
      );
      this.cache.set(path, result);
      return result;
    } finally {
      this.active.delete(path);
    }
  }
  values(node) {
    const path = this.idx.paths.get(node.id),
      result = Object.create(null);
    for (const m of node.members.filter((m) => m.kind === "property"))
      result[m.name] = this.get(path + "." + m.name);
    return result;
  }
  validateReferences() {
    const visiting = new Set(),
      done = new Set();
    const visit = (path, depth = 0) => {
      if (visiting.has(path)) throw new Error(`循环引用：${path}`);
      if (done.has(path)) return;
      if (depth > 64) throw new Error("变量引用超过 64 层");
      const p = this.idx.byPath.get(path);
      if (!p || p.kind !== "property") return;
      visiting.add(path);
      for (const ref of references(expressionOf(p))) {
        const resolved = resolveReference(ref, path),
          target = this.aliases.get(resolved) || resolved;
        if (
          !this.idx.byPath.has(target) &&
          !resolved.startsWith("pogget.") &&
          !(
            /\.(hovered|hoverProgress)$/.test(resolved) &&
            this.idx.byPath.has(resolved.slice(0, resolved.lastIndexOf(".")))
          )
        )
          throw new Error(`未知引用：${ref}（${path}）`);
        visit(target, depth + 1);
      }
      visiting.delete(path);
      done.add(path);
    };
    for (const [path, p] of this.idx.byPath)
      if (p.kind === "property") visit(path);
    for (const root of this.doc.roots) {
      const state = block(root, "state");
      if (!state) continue;
      if (state.members.some((m) => m.kind === "block"))
        throw new Error("state 只能包含字面量变量");
      for (const p of state.members) {
        const expr = expressionOf(p);
        if (
          !("value" in expr) &&
          !(expr.op === "-u" && typeof expr.args[0]?.value === "number")
        )
          throw new Error("state 默认值必须为字面量");
      }
    }
  }
}
export function viewNodes(doc) {
  const result = [];
  const visit = (node, parent, component) => {
    result.push({ node, parent, component });
    for (const child of node.members)
      if (child.kind === "block" && !META.has(child.name))
        visit(child, node, component);
  };
  for (const root of doc.roots) {
    const view = block(root, "view");
    if (view) visit(view, null, root);
  }
  return result;
}
export function parsePoints(source, closed = false) {
  if (
    typeof source !== "string" ||
    source.length > 32768 ||
    /[^\x00-\x7f]/.test(source)
  )
    throw new Error("路径需要 2..512 个 ASCII x,y 坐标对");
  const result = [],
    numeric = "-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
  const pattern = new RegExp(`^(${numeric})\\s*,\\s*(${numeric})(?=\\s|$)`);
  let rest = source.trim();
  while (rest) {
    const match = pattern.exec(rest);
    if (!match) throw new Error("路径格式应为 x,y x,y，不支持 SVG 命令");
    const p = { x: Number(match[1]), y: Number(match[2]) };
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      Math.abs(p.x) > 32768 ||
      Math.abs(p.y) > 32768
    )
      throw new Error("路径坐标范围为 -32768..32768");
    result.push(p);
    if (result.length > 512) throw new Error("路径最多 512 个点");
    rest = rest.slice(match[0].length).trimStart();
  }
  if (result.length < (closed ? 3 : 2))
    throw new Error(closed ? "闭合路径至少需要三个点" : "路径至少需要两个点");
  return result;
}
export const pointsText = (points) =>
  points.map((p) => `${+p.x.toFixed(4)},${+p.y.toFixed(4)}`).join(" ");
export function pathData(points, closed, smooth, tension = 0.25) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (!smooth) d += ` L ${b.x} ${b.y}`;
    else {
      const prev = points[i === 0 ? (closed ? points.length - 1 : 0) : i - 1],
        next = points[(i + 2) % points.length] || b;
      // D2DDrawSmoothPath uses cubic tangents scaled by tension.
      const following = !closed && i + 2 >= points.length ? b : next;
      d += ` C ${a.x + (b.x - prev.x) * tension} ${a.y + (b.y - prev.y) * tension} ${b.x - (following.x - a.x) * tension} ${b.y - (following.y - a.y) * tension} ${b.x} ${b.y}`;
    }
  }
  return d + (closed ? " Z" : "");
}
export function colorHex(value) {
  const n = color(Number(value));
  return (
    "#" +
    [n & 255, (n >> 8) & 255, (n >> 16) & 255]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}
export function colorRaw(hex) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error("请输入 #RRGGBB 颜色");
  return `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
}
export function createProject() {
  return {
    version: 2,
    board: { w: 360, h: 480 },
    doc: parse('Preset { dependsOn: "Pogget_Std" }'),
    baseName: "Pogget_Std",
    locks: [],
  };
}
export function createView(
  doc,
  type,
  x = 20,
  y = 20,
  parentId = null,
  reservedNames = [],
) {
  if (!TYPES.includes(type)) throw new Error("未知组件类型");
  const idx = index(doc),
    parent = idx.byId.get(parentId),
    members = parent?.members || doc.roots;
  let name =
    type.split(".").at(-1)[0].toUpperCase() +
    type.split(".").at(-1).slice(1) +
    "1";
  let i = 1;
  while (
    members.some((m) => m.name === name) ||
    (!parent && reservedNames.includes(name))
  )
    name = name.replace(/\d+$/, "") + ++i;
  const props = {
    type,
    x,
    y,
    width: 160,
    height: type === "text" ? 24 : 60,
    opacity: 1,
    visible: true,
    enabled: true,
  };
  if (["rect", "solid", "button", "container", "rectangle"].includes(type))
    Object.assign(props, { background: 0xfb7952, radius: 10 });
  if (["text", "button", "icon"].includes(type))
    Object.assign(props, {
      label: type === "button" ? "切换视图" : "文字",
      textLiteral: true,
      textSize: 14,
      color: 0xffffff,
      font: "Segoe UI",
    });
  if (type === "icon") props.icon = "★";
  if (type === "button") {
    props.action = "pogget.action.view.toggle";
    props.transition = 0.2;
  }
  if (type === "glass")
    Object.assign(props, {
      radius: 16,
      blur: 8,
      blurRenderer: "title",
      glassRenderer: "standard",
      glassOpacity: 0.8,
      glassBorder: 1,
    });
  if (type === "group")
    Object.assign(props, { height: 120, clip: false, clipRadius: 0 });
  if (type === "path")
    Object.assign(props, {
      width: 100,
      height: 100,
      points: "8,50 38,80 92,16",
      closed: false,
      borderOnly: true,
      border: 3,
      borderColor: 0xfb7952,
      pathWidth: 100,
      pathHeight: 100,
      smooth: false,
      tension: 0.25,
    });
  if (type === "image")
    Object.assign(props, {
      source: "",
      imageRenderer: "wic",
      imageFit: "contain",
    });
  if (type === "content") props.source = "markdown";
  const node = makeBlock(parent ? name : "view", props);
  if (parent) parent.members.push(node);
  else doc.roots.push(makeBlock(name, {}, [node]));
  return node;
}

// History records complete document transactions; runtime and selection are separate.
export class History {
  constructor(initial, limit = 100, byteLimit = 32 * 1024 * 1024) {
    this.entries = [clone(initial)];
    this.position = 0;
    this.limit = limit;
    this.byteLimit = byteLimit;
    this.sizes = [JSON.stringify(initial).length * 2];
    this.pending = null;
  }
  get canUndo() {
    return this.position > 0;
  }
  get canRedo() {
    return this.position < this.entries.length - 1;
  }
  commit(value, label = "编辑") {
    this.pending = null;
    if (JSON.stringify(this.entries[this.position]) === JSON.stringify(value))
      return false;
    this.entries.splice(this.position + 1);
    this.sizes.splice(this.position + 1);
    this.entries.push(clone(value));
    this.sizes.push(JSON.stringify(value).length * 2);
    this.position++;
    while (
      this.entries.length > 1 &&
      (this.entries.length > this.limit + 1 ||
        this.sizes.reduce((a, b) => a + b, 0) > this.byteLimit)
    ) {
      this.entries.shift();
      this.sizes.shift();
      this.position--;
    }
    this.label = label;
    return true;
  }
  undo() {
    this.pending = null;
    return this.canUndo ? clone(this.entries[--this.position]) : null;
  }
  redo() {
    this.pending = null;
    return this.canRedo ? clone(this.entries[++this.position]) : null;
  }
}
