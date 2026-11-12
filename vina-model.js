import {
  parse,
  serialize,
  parseExpression,
  expressionOf,
  references,
  resolveReference,
  evaluateExpression,
  Runtime,
  compose,
  index,
  viewNodes,
  property,
  block,
  setRaw,
  setValue,
  makeBlock,
  createView,
  clone,
  uid,
  META,
  TYPES,
  parsePoints,
} from "./vina-core.js";
import { isHostPreset } from "./vina-scene.js";

export function effectiveProject(project, standard) {
  const dependency = project.doc.roots.find((n) => n.name === "Preset");
  const name = dependency
    ? evaluateExpression(expressionOf(property(dependency, "dependsOn")))
    : "";
  const base = name
    ? project.base && project.baseName?.toLowerCase() === name.toLowerCase()
      ? project.base
      : name.toLowerCase() === "pogget_std"
        ? standard
        : null
    : null;
  return compose(project.doc, base);
}
export function validate(project, standard, inputs = {}, schema = {}) {
  // Reparse also verifies JSON projects and mutations against grammar/limits.
  parse(serialize(project.doc));
  if (
    !project.board ||
    !Number.isFinite(project.board.w) ||
    !Number.isFinite(project.board.h) ||
    project.board.w < 120 ||
    project.board.h < 120 ||
    project.board.w > 32768 ||
    project.board.h > 32768
  )
    throw new Error("画板尺寸范围为 120..32768");
  const doc = effectiveProject(project, standard),
    runtime = new Runtime(doc, inputs);
  runtime.validateReferences();
  const views = viewNodes(doc),
    actions = schema.actions || [];
  for (const { node } of views) {
    const path = runtime.idx.paths.get(node.id);
    const get = (key, fallback) => runtime.get(path + "." + key, fallback);
    const type = get(
      "type",
      node.members.some((m) => m.kind === "block" && !META.has(m.name))
        ? "group"
        : "text",
    );
    if (!TYPES.includes(type)) throw new Error(`${path}：不支持 ${type}`);
    const hover = block(node, "hover");
    for (const p of [
      ...node.members.filter((m) => m.kind === "property"),
      ...(hover?.members.filter((m) => m.kind === "property") || []),
    ]) {
      const hot = hover?.members.includes(p),
        propertyPath = path + (hot ? ".hover" : "") + "." + p.name;
      if (["hovered", "hoverProgress"].includes(p.name))
        throw new Error(`${path}：${p.name} 是只读输入`);
      let value;
      try {
        value = runtime.get(propertyPath);
      } catch (error) {
        if (error.message.startsWith("变量不可用：pogget.")) continue;
        throw error;
      }
      const bounds =
        schema.bounds?.[p.name] ||
        {
          x: [-32768, 32768],
          y: [-32768, 32768],
          width: [0, 32768],
          height: [0, 32768],
          w: [0, 32768],
          h: [0, 32768],
          opacity: [0, 1],
          radius: [0, 32768],
          tension: [0, 1],
          pathWidth: [0.001, 32768],
          pathHeight: [0.001, 32768],
        }[p.name];
      if (
        bounds &&
        !(p.name === "texture" && typeof value === "boolean") &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < bounds[0] ||
          value > bounds[1])
      )
        throw new Error(`${path}.${p.name}：范围 ${bounds.join("..")}`);
      if (
        /^(background|color|borderColor|shadowColor|textShadowColor|glassTintColor)$/.test(
          p.name,
        ) &&
        (!Number.isInteger(value) || value < 0 || value > 0xffffff)
      )
        throw new Error(`${path}.${p.name}：必须为 COLORREF 颜色`);
      if (
        ["action", "holdAction"].includes(p.name) &&
        value &&
        actions.length &&
        !actions.includes(value)
      )
        throw new Error(`${path}.${p.name}：未知动作`);
      const enums = {
        blendMode: ["", "normal", "multiply", "linearDodge"],
        borderStyle: ["solid", "dash"],
        glassRenderer: ["standard", "lightEffect"],
        imageRenderer: ["wic", "shell", "resource"],
        imageFit: ["stretch", "contain"],
        clipAntialias: ["perPrimitive", "aliased"],
        blurRenderer: ["title", "snapshot"],
      };
      if (enums[p.name] && !enums[p.name].includes(value))
        throw new Error(`${path}.${p.name}：无效选项`);
    }
    if (type === "path") {
      const points = parsePoints(get("points", ""), get("closed", true));
      for (const p of points)
        if (
          Math.abs((p.x / get("pathWidth", 100)) * get("width", 40)) >
            1048576 ||
          Math.abs((p.y / get("pathHeight", 100)) * get("height", 40)) > 1048576
        )
          throw new Error(`${path}：缩放后的路径坐标超限`);
    }
    if (property(node, "toggle")) {
      const declaration = expressionOf(property(node, "toggle"));
      if (!("value" in declaration) || typeof declaration.value !== "string")
        throw new Error(`${path}.toggle：必须是状态变量路径字面量`);
      const target = get("toggle", ""),
        state = target.startsWith("state.")
          ? path.split(".")[0] + "." + target
          : target;
      if (
        !/^[^.]+\.state\./.test(state) ||
        typeof runtime.get(state) !== "boolean"
      )
        throw new Error(`${path}.toggle：必须指向布尔 state 变量`);
    }
    if (
      type === "glass" &&
      !!property(node, "glassPointerX") !== !!property(node, "glassPointerY")
    )
      throw new Error(`${path}：玻璃指针坐标必须成对声明`);
    const repeat = block(node, "repeat");
    if (repeat) {
      const count = runtime.get(path + ".repeat.count", 0);
      if (!Number.isInteger(count) || count < 0 || count > 256)
        throw new Error(`${path}.repeat.count：范围为 0..256 的整数`);
    }
    for (const destination of ["backgroundGradient", "borderGradient"]) {
      const gradient = block(node, destination);
      if (!gradient) {
        if (block(hover, destination))
          throw new Error("hover 渐变必须先声明基础渐变");
        continue;
      }
      const check = (g, hot = false) => {
        const allowed = new Set([
          "type",
          "enabled",
          "startX",
          "startY",
          "endX",
          "endY",
          "centerX",
          "centerY",
          "radiusX",
          "radiusY",
        ]);
        for (const m of g.members)
          if (m.kind === "property" ? !allowed.has(m.name) : m.name !== "stops")
            throw new Error("未知渐变属性 " + m.name);
        const gp = path + "." + (hot ? "hover." : "") + destination;
        const val = (key, fallback) =>
          runtime.get(
            gp + "." + key,
            hot
              ? runtime.get(path + "." + destination + "." + key, fallback)
              : fallback,
          );
        const kind = val("type", "linear");
        if (!["linear", "radial"].includes(kind))
          throw new Error("渐变类型必须为 linear/radial");
        if (typeof val("enabled", true) !== "boolean")
          throw new Error("渐变 enabled 必须为布尔值");
        const defaults = {
          startX: 0,
          startY: 0,
          endX: 1,
          endY: 0,
          centerX: 0.5,
          centerY: 0.5,
          radiusX: 0.5,
          radiusY: 0.5,
        };
        for (const [key, fallback] of Object.entries(defaults)) {
          const n = val(key, fallback);
          if (
            typeof n !== "number" ||
            n < (key.startsWith("radius") ? 0.0001 : -8) ||
            n > 8
          )
            throw new Error("渐变坐标范围错误");
        }
        if (
          kind === "linear" &&
          val("startX", 0) === val("endX", 1) &&
          val("startY", 0) === val("endY", 0)
        )
          throw new Error("线性渐变起终点不能重合");
        const stops = block(g, "stops");
        if (
          !hot &&
          (!stops || stops.members.length < 2 || stops.members.length > 16)
        )
          throw new Error("渐变需要 2..16 个色标");
        let previous = -Infinity;
        for (const stop of stops?.members || []) {
          if (stop.kind !== "block") throw new Error("色标必须是命名块");
          if (hot && !block(block(gradient, "stops"), stop.name))
            throw new Error("hover 不能添加新的渐变色标");
          for (const p of stop.members)
            if (
              p.kind !== "property" ||
              !["position", "color", "opacity"].includes(p.name)
            )
              throw new Error("未知色标属性");
          const basePath = path + "." + destination + ".stops." + stop.name,
            sp = gp + ".stops." + stop.name;
          const at = runtime.get(
              sp + ".position",
              hot ? runtime.get(basePath + ".position", 0) : NaN,
            ),
            color = runtime.get(
              sp + ".color",
              hot ? runtime.get(basePath + ".color", 0) : NaN,
            ),
            alpha = runtime.get(sp + ".opacity", 1);
          if (
            !Number.isFinite(at) ||
            at < 0 ||
            at > 1 ||
            at < previous ||
            !Number.isInteger(color) ||
            color < 0 ||
            color > 0xffffff ||
            typeof alpha !== "number" ||
            alpha < 0 ||
            alpha > 1
          )
            throw new Error("色标位置需升序，颜色和透明度必须有效");
          previous = at;
        }
      };
      check(gradient);
      const hot = block(block(node, "hover"), destination);
      if (hot) check(hot, true);
      const active =
        runtime.get(path + "." + destination + ".enabled", true) ||
        runtime.get(path + ".hover." + destination + ".enabled", false);
      if (active && type === "glass")
        throw new Error("glass 不支持渐变，请叠加普通图元");
      if (
        active &&
        destination === "backgroundGradient" &&
        property(node, "texture") &&
        get("texture", false) !== false
      )
        throw new Error("背景渐变与纹理不能同时启用");
    }
  }
  for (const root of doc.roots) {
    const ui = block(root, "ui");
    if (!ui) continue;
    for (const field of ui.members.filter((n) => n.kind === "block")) {
      const path = root.name + ".ui." + field.name,
        get = (k, d) => runtime.get(path + "." + k, d),
        kind = get("control", get("type", "number"));
      if (
        ![
          "slider",
          "number",
          "switch",
          "toggle",
          "choice",
          "select",
          "text",
          "edit",
          "color",
          "button",
          "font",
        ].includes(kind)
      )
        throw new Error(path + "：未知 ui 控件");
      if (kind !== "button" && !property(field, "default"))
        throw new Error(path + "：ui 控件需要默认值");
      if (["number", "slider"].includes(kind)) {
        const value = get("default"),
          low = get("min", 0),
          high = get("max", 1),
          step = get("step", 0.01),
          sentinel = get("bind", "") === "TitleBlurRadius" && value === -1;
        if (
          typeof value !== "number" ||
          low > high ||
          step <= 0 ||
          (!sentinel && (value < low || value > high))
        )
          throw new Error(path + "：数值范围、步长或默认值无效");
      }
      if (
        ["switch", "toggle"].includes(kind) &&
        typeof get("default") !== "boolean"
      )
        throw new Error(path + "：开关默认值需为布尔值");
      if (["choice", "select"].includes(kind)) {
        const choices = block(field, "choices") || block(field, "options"),
          rawValue = get("default"),
          value = typeof rawValue === "boolean" ? Number(rawValue) : rawValue;
        if (
          !choices ||
          !Number.isInteger(value) ||
          value < 0 ||
          value >= choices.members.length
        )
          throw new Error(path + "：默认值需为有效的选项序号");
      }
    }
  }
  return { doc, runtime, views };
}
export function selectedRoots(doc, ids) {
  const idx = index(doc),
    wanted = new Set(ids);
  return [...wanted].filter(
    (id) =>
      idx.byId.has(id) && !ancestors(idx, id).some((a) => wanted.has(a.id)),
  );
}
export function ancestors(idx, id) {
  const result = [];
  let parent = idx.parents.get(id);
  while (parent) {
    result.push(parent);
    parent = idx.parents.get(parent.id);
  }
  return result;
}
export function worldBounds(doc, node, inputs = {}) {
  const runtime = new Runtime(doc, inputs),
    idx = runtime.idx;
  let current = node,
    x = 0,
    y = 0;
  while (current) {
    const path = idx.paths.get(current.id);
    x += Number(runtime.get(path + ".x", 0));
    y += Number(runtime.get(path + ".y", 0));
    current = idx.parents.get(current.id);
    if (current && !idx.paths.get(current.id).includes(".view")) break;
  }
  const path = idx.paths.get(node.id);
  return {
    x,
    y,
    w: Number(runtime.get(path + ".width", runtime.get(path + ".w", 40))),
    h: Number(runtime.get(path + ".height", runtime.get(path + ".h", 40))),
  };
}
function uniqueName(members, desired) {
  const stem = desired.replace(/\d+$/, "") || "Node";
  let name = desired,
    i = 1;
  while (members.some((m) => m.name === name)) name = stem + ++i;
  return name;
}
const reservedComponents = (inputs) =>
  [
    ...new Set(
      Object.keys(inputs)
        .filter((path) => !path.startsWith("pogget."))
        .map((path) => path.split(".")[0]),
    ),
  ].map((name) => ({ name }));
function detach(doc, id) {
  const idx = index(doc),
    node = idx.byId.get(id),
    parent = idx.parents.get(id);
  if (!node) throw new Error("组件不存在");
  const list = parent?.members || doc.roots;
  list.splice(list.indexOf(node), 1);
  if (parent && !idx.parents.get(parent.id) && parent.members.length === 0)
    doc.roots.splice(doc.roots.indexOf(parent), 1);
  return node;
}
// Reference token offsets come from a scanner, so ${...} inside a label is inert.
function referenceSpans(raw) {
  const result = [];
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith("//", i)) {
      i = raw.indexOf("\n", i);
      if (i < 0) break;
    } else if (raw.startsWith("/*", i)) {
      i = raw.indexOf("*/", i + 2) + 2;
      if (i === 1) break;
    } else if (raw[i] === '"' || raw[i] === "'") {
      const q = raw[i++];
      while (i < raw.length) {
        if (raw[i++] === "\\") i++;
        else if (raw[i - 1] === q) break;
      }
    } else if (raw.startsWith("${", i)) {
      const end = raw.indexOf("}", i + 2);
      result.push({ start: i, end: end + 1, ref: raw.slice(i + 2, end) });
      i = end + 1;
    } else i++;
  }
  return result;
}
function rewriteMoved(doc, before, compensations = new Map()) {
  const after = index(doc),
    mappings = [...before.paths]
      .filter(
        ([id, path]) => after.paths.has(id) && after.paths.get(id) !== path,
      )
      .map(([id, path]) => [path, after.paths.get(id)])
      .sort((a, b) => b[0].length - a[0].length);
  for (const [id, p] of after.byId)
    if (p.kind === "property") {
      const oldOwner = before.paths.get(id);
      if (!oldOwner) continue;
      let raw = p.raw;
      for (const span of referenceSpans(raw).reverse()) {
        const old = resolveReference(span.ref, oldOwner),
          mapping = mappings.find(
            ([from]) => old === from || old.startsWith(from + "."),
          );
        const target = mapping
            ? mapping[1] + old.slice(mapping[0].length)
            : old,
          compensation = compensations.get(old);
        if (target !== old || oldOwner !== after.paths.get(id))
          raw =
            raw.slice(0, span.start) +
            (compensation
              ? "(${" + target + "}" + compensation + ")"
              : "${" + target + "}") +
            raw.slice(span.end);
      }
      p.raw = raw;
    }
}
export function rename(doc, id, name) {
  const before = index(doc),
    node = before.byId.get(id),
    parent = before.parents.get(id),
    members = parent?.members || doc.roots;
  if (!node || !name || members.some((m) => m.id !== id && m.name === name))
    throw new Error("名称重复或无效");
  node.name = name;
  rewriteMoved(doc, before);
}
export function reparent(doc, ids, parentId, inputs = {}) {
  ids = selectedRoots(doc, ids);
  const before = index(doc),
    parent = before.byId.get(parentId);
  if (parentId && (!parent || parent.kind !== "block"))
    throw new Error("目标组不存在");
  if (
    parent &&
    ids.some(
      (id) =>
        id === parentId || ancestors(before, parentId).some((a) => a.id === id),
    )
  )
    throw new Error("不能把组放入自身或后代");
  const runtime = new Runtime(doc, inputs);
  if (parent && runtime.get(before.paths.get(parentId) + ".type") !== "group")
    throw new Error("只能移动到 group");
  const target = parent ? worldBounds(doc, parent, inputs) : { x: 0, y: 0 };
  const compensations = new Map();
  const moving = ids.map((id) => ({
    node: before.byId.get(id),
    bounds: worldBounds(doc, before.byId.get(id), inputs),
  }));
  for (const { node, bounds } of moving) {
    const owner = before.parents.get(node.id),
      oldName = owner && !before.parents.get(owner.id) ? owner.name : node.name;
    // Preserve responsive local expressions. Parent-origin compensation is a
    // snapshot: subsequent movement must follow the new parent, not cancel it.
    for (const axis of ["x", "y"]) {
      const original = property(node, axis)?.raw || "0",
        local = Number(runtime.get(before.paths.get(node.id) + "." + axis, 0)),
        offset = bounds[axis] - local - target[axis];
      const expr = parseExpression(original);
      if ("value" in expr && typeof expr.value === "number")
        setValue(node, axis, expr.value + offset);
      else
        setRaw(node, axis, offset ? `(${original}) + (${offset})` : original);
      if (offset)
        compensations.set(
          before.paths.get(node.id) + "." + axis,
          ` - (${offset})`,
        );
    }
    detach(doc, node.id);
    if (parent) {
      node.name = uniqueName(
        parent.members,
        oldName === "view" ? "Node1" : oldName,
      );
      parent.members.push(node);
    } else {
      node.name = "view";
      const name = uniqueName(
        [...doc.roots, ...reservedComponents(inputs)],
        oldName === "view" ? "Node1" : oldName,
      );
      doc.roots.push(makeBlock(name, {}, [node]));
    }
  }
  rewriteMoved(doc, before, compensations);
  return ids;
}
export function group(doc, ids, inputs = {}) {
  ids = selectedRoots(doc, ids);
  if (!ids.length) throw new Error("先选择组件");
  const idx = index(doc),
    entries = ids.map((id) => idx.byId.get(id));
  const parents = entries.map((n) => {
    const p = idx.parents.get(n.id);
    return p && idx.parents.get(p.id) ? p : null;
  });
  if (parents.some((p) => p?.id !== parents[0]?.id))
    throw new Error("编组需选择同一层级的组件");
  const bounds = entries.map((n) => worldBounds(doc, n, inputs));
  const left = Math.min(...bounds.map((b) => b.x)),
    top = Math.min(...bounds.map((b) => b.y));
  const parent = parents[0],
    origin = parent ? worldBounds(doc, parent, inputs) : { x: 0, y: 0 };
  const node = createView(
    doc,
    "group",
    left - origin.x,
    top - origin.y,
    parent?.id,
    reservedComponents(inputs).map((n) => n.name),
  );
  setValue(node, "width", Math.max(1, ...bounds.map((b) => b.x + b.w - left)));
  setValue(node, "height", Math.max(1, ...bounds.map((b) => b.y + b.h - top)));
  reparent(doc, ids, node.id, inputs);
  return node.id;
}
export function ungroup(doc, ids, inputs = {}) {
  const result = [];
  for (const id of selectedRoots(doc, ids)) {
    const idx = index(doc),
      node = idx.byId.get(id),
      path = idx.paths.get(id),
      runtime = new Runtime(doc, inputs);
    if (runtime.get(path + ".type") !== "group") continue;
    // Removing a clip/opacity/action scope would change its children. Require an
    // explicit reset instead of silently flattening appearance and hit behavior.
    const p = runtime.values(node);
    if (
      p.clip ||
      p.clipLayer ||
      (p.opacity != null && p.opacity !== 1) ||
      p.visible === false ||
      p.enabled === false ||
      p.action ||
      p.holdAction ||
      p.slot ||
      p.interaction ||
      p.toggle ||
      p.background != null ||
      p.border ||
      p.blur ||
      p.shadowOpacity ||
      block(node, "backgroundGradient") ||
      block(node, "borderGradient") ||
      block(node, "hover") ||
      (p.blendMode && p.blendMode !== "normal")
    )
      throw new Error("此组带有裁剪、外观或交互继承；请先重置再解除编组");
    const children = node.members.filter(
      (m) => m.kind === "block" && !META.has(m.name),
    );
    const parent = idx.parents.get(id),
      parentId = parent && idx.parents.get(parent.id) ? parent.id : null;
    reparent(
      doc,
      children.map((n) => n.id),
      parentId,
      inputs,
    );
    // Substitute references to the removed scope, including responsive geometry.
    const current = index(doc),
      removedPath = current.paths.get(id),
      removed = new Map(
        [...current.byPath].filter(
          ([path, p]) =>
            p.kind === "property" && path.startsWith(removedPath + "."),
        ),
      );
    const expand = (raw, owner, depth = 0) => {
      if (depth > 64) throw new Error("解除编组后的引用嵌套过深");
      for (const span of referenceSpans(raw).reverse()) {
        const target = resolveReference(span.ref, owner),
          p = removed.get(target);
        if (p)
          raw =
            raw.slice(0, span.start) +
            "(" +
            expand(p.raw, target, depth + 1) +
            ")" +
            raw.slice(span.end);
        else if (target.startsWith(removedPath + "."))
          throw new Error("仍有引用依赖此组的交互状态，不能解除编组");
        else
          raw =
            raw.slice(0, span.start) +
            "${" +
            target +
            "}" +
            raw.slice(span.end);
      }
      return raw;
    };
    for (const [path, p] of current.byPath)
      if (p.kind === "property" && !path.startsWith(removedPath + "."))
        p.raw = expand(p.raw, path);
    detach(doc, id);
    result.push(...children.map((n) => n.id));
  }
  return result;
}
export function remove(doc, ids) {
  for (const id of selectedRoots(doc, ids)) detach(doc, id);
}
export function duplicate(doc, ids, inputs = {}) {
  const result = [];
  for (const id of selectedRoots(doc, ids)) {
    const before = index(doc),
      node = before.byId.get(id),
      parent = before.parents.get(id),
      isRoot = parent && !before.parents.get(parent.id);
    const original = isRoot ? parent : node,
      copy = clone(original),
      map = new Map();
    const fresh = (n) => {
      const old = n.id;
      n.id = uid();
      map.set(old, n.id);
      if (n.members) n.members.forEach(fresh);
    };
    fresh(copy);
    const list = isRoot ? doc.roots : parent.members;
    copy.name = uniqueName(
      isRoot ? [...list, ...reservedComponents(inputs)] : list,
      copy.name,
    );
    list.splice(list.indexOf(original) + 1, 0, copy);
    const copiedView = isRoot ? block(copy, "view") : copy,
      after = index(doc),
      oldPrefix = before.paths.get(original.id),
      newPrefix = after.paths.get(copy.id);
    for (const [old, newId] of map) {
      const p = after.byId.get(newId);
      if (p.kind !== "property") continue;
      const owner = before.paths.get(old);
      for (const span of referenceSpans(p.raw).reverse()) {
        const ref = resolveReference(span.ref, owner);
        const target =
          ref === oldPrefix || ref.startsWith(oldPrefix + ".")
            ? newPrefix + ref.slice(oldPrefix.length)
            : ref;
        p.raw =
          p.raw.slice(0, span.start) +
          "${" +
          target +
          "}" +
          p.raw.slice(span.end);
      }
    }
    for (const key of ["x", "y"]) {
      const prop = property(copiedView, key);
      setRaw(copiedView, key, `(${prop?.raw || "0"}) + 16`);
    }
    result.push(copiedView.id);
  }
  return result;
}
export function copySelection(doc, ids, inputs = {}) {
  const before = index(doc),
    bundle = { roots: [] };
  for (const id of selectedRoots(doc, ids)) {
    const source = before.byId.get(id),
      path = before.paths.get(id),
      component = doc.roots.find((n) => n.name === path.split(".")[0]);
    const copiedView = clone(source),
      root = makeBlock(
        uniqueName([...doc.roots, ...bundle.roots], component.name + "_Copy"),
        {},
        [
          ...component.members.filter((n) => n.name !== "view").map(clone),
          copiedView,
        ],
      );
    copiedView.name = "view";
    const mappings = new Map(),
      fresh = (node, old) => {
        node.id = uid();
        if (old) mappings.set(node.id, before.paths.get(old.id));
        if (node.kind === "block")
          node.members.forEach((m, i) => fresh(m, old?.members[i]));
      };
    for (let i = 0; i < root.members.length - 1; i++)
      fresh(
        root.members[i],
        component.members.filter((n) => n.name !== "view")[i],
      );
    fresh(copiedView, source);
    bundle.roots.push(root);
    const after = index(bundle),
      oldView = path,
      newView = after.paths.get(copiedView.id);
    for (const [newId, owner] of mappings) {
      const p = after.byId.get(newId);
      if (p.kind !== "property") continue;
      for (const span of referenceSpans(p.raw).reverse()) {
        let target = resolveReference(span.ref, owner);
        if (target === oldView || target.startsWith(oldView + "."))
          target = newView + target.slice(oldView.length);
        else if (
          target.startsWith(component.name + ".") &&
          !target.startsWith(component.name + ".view.")
        )
          target = root.name + target.slice(component.name.length);
        p.raw =
          p.raw.slice(0, span.start) +
          "${" +
          target +
          "}" +
          p.raw.slice(span.end);
      }
    }
    const bounds = worldBounds(doc, source, inputs),
      runtime = new Runtime(doc, inputs);
    for (const axis of ["x", "y"]) {
      const raw = property(copiedView, axis)?.raw || "0",
        offset = bounds[axis] - Number(runtime.get(path + "." + axis, 0)) + 16;
      setRaw(copiedView, axis, `(${raw}) + (${offset})`);
    }
  }
  return bundle;
}
export function pasteSelection(doc, bundle, inputs = {}) {
  bundle = clone(bundle);
  const existing = new Set(
    [...doc.roots, ...reservedComponents(inputs)].map((n) => n.name),
  );
  // Give temporary roots unique names first so cross-root references are also
  // rewritten as a single document. Then freshen all IDs for repeated paste.
  for (const root of bundle.roots) {
    let name = root.name,
      n = 1;
    while (existing.has(name)) name = root.name + "_" + ++n;
    rename(bundle, root.id, name);
    existing.add(name);
  }
  const fresh = (n) => {
    n.id = uid();
    if (n.members) n.members.forEach(fresh);
  };
  bundle.roots.forEach(fresh);
  doc.roots.push(...bundle.roots);
  return bundle.roots.map((n) => block(n, "view")?.id).filter(Boolean);
}
export function reorder(doc, ids, direction, inputs = {}) {
  const idx = index(doc);
  for (const id of selectedRoots(doc, ids)) {
    const n = idx.byId.get(id),
      p = idx.parents.get(id),
      root = p && !idx.parents.get(p.id),
      node = root ? p : n,
      list = root ? doc.roots : p.members;
    const runtime = new Runtime(doc, inputs),
      paintOf = (member) => (root ? block(member, "view") : member);
    const siblings = list
      .filter(
        (m) => m.kind === "block" && (root || !META.has(m.name)) && paintOf(m),
      )
      .sort(
        (a, b) =>
          runtime.get(idx.paths.get(paintOf(a).id) + ".z", 0) -
          runtime.get(idx.paths.get(paintOf(b).id) + ".z", 0),
      );
    const position = siblings.indexOf(node),
      other = siblings[position + direction];
    if (!other) continue;
    setValue(n, "z", runtime.get(idx.paths.get(paintOf(other).id) + ".z", 0));
    list.splice(list.indexOf(node), 1);
    const to = list.indexOf(other) + (direction > 0 ? 1 : 0);
    list.splice(to, 0, node);
  }
}
export function align(doc, ids, mode, inputs = {}) {
  const selected = selectedRoots(doc, ids),
    idx = index(doc),
    entries = selected.map((id) => ({
      node: idx.byId.get(id),
      b: worldBounds(doc, idx.byId.get(id), inputs),
    }));
  if (entries.length < 2) throw new Error("对齐需选择至少两个组件");
  const minX = Math.min(...entries.map((e) => e.b.x)),
    minY = Math.min(...entries.map((e) => e.b.y)),
    maxX = Math.max(...entries.map((e) => e.b.x + e.b.w)),
    maxY = Math.max(...entries.map((e) => e.b.y + e.b.h));
  if (mode === "distributeX" || mode === "distributeY") {
    if (entries.length < 3) throw new Error("分布需选择至少三个组件");
    const axis = mode === "distributeX" ? "x" : "y",
      size = axis === "x" ? "w" : "h";
    entries.sort((a, b) => a.b[axis] - b.b[axis]);
    const span =
        entries.at(-1).b[axis] + entries.at(-1).b[size] - entries[0].b[axis],
      gap =
        (span - entries.reduce((sum, e) => sum + e.b[size], 0)) /
        (entries.length - 1);
    let next = entries[0].b[axis];
    for (const e of entries) {
      const p = property(e.node, axis);
      setRaw(e.node, axis, `(${p?.raw || 0}) + (${next - e.b[axis]})`);
      next += e.b[size] + gap;
    }
    return;
  }
  for (const { node, b } of entries) {
    const axis = ["left", "center", "right"].includes(mode) ? "x" : "y";
    const target = {
      left: minX,
      center: (minX + maxX - b.w) / 2,
      right: maxX - b.w,
      top: minY,
      middle: (minY + maxY - b.h) / 2,
      bottom: maxY - b.h,
    }[mode];
    const p = property(node, axis);
    setRaw(node, axis, `(${p?.raw || 0}) + (${target - b[axis]})`);
  }
}
export function projectFromVina(source, previous) {
  const doc = parse(source);
  if (!doc.roots.length) throw new Error("文件中没有 Vina 组件");
  return {
    version: 2,
    board: clone(
      isHostPreset(doc) && !isHostPreset(previous?.doc || { roots: [] })
        ? { w: 480, h: 360 }
        : previous?.board || { w: 360, h: 480 },
    ),
    doc,
    locks: [],
    ...(previous?.base
      ? { base: previous.base, baseName: previous.baseName }
      : {}),
  };
}
export function projectSource(project) {
  const canonical = serialize(project.doc);
  return project.linkedSource?.canonical === canonical
    ? project.linkedSource.source
    : canonical;
}
export function projectFromJSON(text) {
  const value = JSON.parse(text);
  if (value.version !== 2 || !value.doc || !Array.isArray(value.doc.roots))
    throw new Error("不是受支持的 .vina-project.json 文件");
  const doc = parse(serialize(value.doc)),
    oldIndex = index(value.doc),
    newIndex = index(doc);
  const project = {
    version: 2,
    board: value.board,
    doc,
    locks: (value.locks || [])
      .map((id) => newIndex.byPath.get(oldIndex.paths.get(id))?.id)
      .filter(Boolean),
    name: typeof value.name === "string" ? value.name : undefined,
  };
  if (value.base) {
    project.base = parse(serialize(value.base));
    project.baseName = String(value.baseName || "");
  }
  // Optional graph data is bounded and verified against source when opened.
  if (
    value.behaviorGraph &&
    JSON.stringify(value.behaviorGraph).length <= 4 * 1024 * 1024
  )
    project.behaviorGraph = value.behaviorGraph;
  try {
    if (
      typeof value.linkedSource?.source === "string" &&
      value.linkedSource.canonical === serialize(doc) &&
      serialize(parse(value.linkedSource.source)) === value.linkedSource.canonical
    )
      project.linkedSource = value.linkedSource;
  } catch {
    // Optional format metadata must never prevent loading a valid project.
  }
  // IDs are internal. Reassign them on every untrusted file import.
  return project;
}
