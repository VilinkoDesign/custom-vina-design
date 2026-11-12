import * as V from "./vina-core.js";
import * as B from "./vina-behavior.js";
import { effectiveProject, validate } from "./vina-model.js";
import { icon } from "./icons.js";

const NS = "http://www.w3.org/2000/svg";
const WIDTH = 216;
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const btn = (text, title, fn, cls = "mini-btn") => {
  const n = el("button", cls, text);
  n.type = "button";
  n.title = title || text;
  n.addEventListener("click", fn);
  return n;
};
const height = (n) => 88 + Math.max(1, B.inputsOf(n).length) * 26;
const label = (n) =>
  n.path || n.target || n.action || n.code || B.NODE_TYPES[n.type].title;
const short = (path) => (path.length > 35 ? "…" + path.slice(-34) : path);

export function openBehaviorEditor({
  project,
  standard,
  schema,
  inputs,
  selectedPath,
  apply,
  notify,
}) {
  const graph = B.createGraph(project, standard, inputs);
  // Bound whole-graph history memory; inherited standard graphs can be large.
  const history = new V.History(graph, 50, 24 * 1024 * 1024);
  let draft = graph,
    selected = null,
    selectedEdge = null,
    wire = null,
    gesture = null;
  let scale = 1,
    pan = { x: 48, y: 42 },
    space = false,
    frame = 0,
    closed = false;
  let changed = false,
    discardArmed = false;
  const effective = effectiveProject(project, standard),
    idx = V.index(effective);
  const views = V.viewNodes(effective).map(({ node }) =>
    idx.paths.get(node.id),
  );
  const components = effective.roots
    .filter((n) => n.name !== "Preset")
    .map((n) => n.name);
  let component =
    selectedPath?.split(".")[0] ||
    project.doc.roots.find((n) => n.name !== "Preset")?.name ||
    views[0]?.split(".")[0] ||
    components[0] ||
    "";
  const dialog = el("dialog", "behavior-dialog");
  dialog.id = "behaviorDialog";
  dialog.setAttribute("aria-labelledby", "behaviorTitle");
  const head = el("div", "modal-head behavior-head"),
    heading = el("div");
  const title = el("h3", "behavior-title", "行为节点");
  title.id = "behaviorTitle";
  title.prepend(icon("arrow-pointer"));
  heading.append(
    title,
    el("p", "behavior-subtitle", "用连线编排交互 · CustomVina"),
  );
  const close = btn("×", "关闭行为节点", requestClose, "icon-btn");
  close.setAttribute("aria-label", "关闭行为节点");
  head.append(heading, close);
  const toolbar = el("div", "behavior-toolbar");
  const scope = el("select", "ctl behavior-scope");
  scope.setAttribute("aria-label", "行为所属组件");
  const nodeSearch = el("input", "ctl behavior-node-search");
  nodeSearch.placeholder = "查找行为 / 属性…";
  nodeSearch.setAttribute("aria-label", "查找画布行为节点");
  for (const name of components) {
    const option = el(
      "option",
      "",
      name + (project.doc.roots.some((n) => n.name === name) ? "" : " · 继承"),
    );
    option.value = name;
    scope.append(option);
  }
  scope.value = component;
  const undo = btn("↶", "撤销 Ctrl+Z", () => navigate(false));
  undo.setAttribute("aria-label", "撤销节点编辑");
  const redo = btn("↷", "重做 Ctrl+Shift+Z", () => navigate(true));
  redo.setAttribute("aria-label", "重做节点编辑");
  const fitButton = btn("适应画布", "显示当前组件全部节点 F", fit);
  const zoomOut = btn("−", "缩小", () => zoomAt(scale / 1.2));
  const zoomLabel = el("span", "behavior-zoom", "100%");
  const zoomIn = btn("+", "放大", () => zoomAt(scale * 1.2));
  const summary = el("span", "behavior-count");
  toolbar.append(
    scope,
    nodeSearch,
    undo,
    redo,
    fitButton,
    zoomOut,
    zoomLabel,
    zoomIn,
    summary,
  );
  const body = el("div", "behavior-body"),
    library = el("aside", "behavior-library");
  library.setAttribute("aria-label", "行为节点库");
  library.append(el("h4", "", "添加节点"));
  const search = el("input", "ctl");
  search.placeholder = "搜索节点…";
  search.setAttribute("aria-label", "搜索行为节点");
  const catalog = el("div", "behavior-catalog");
  library.append(search, catalog);
  const example = btn(
    "点击展开示例",
    "为当前组件创建点击切换展开的完整交互",
    addExample,
    "btn-ghost behavior-example",
  );
  library.append(
    example,
    el(
      "p",
      "behavior-library-note",
      "点击端口后点击另一端口，或拖动端口连线。蓝色为数据，虚线为事件。",
    ),
  );
  const viewport = el("div", "behavior-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "行为节点画布");
  const world = el("div", "behavior-world");
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "behavior-wires");
  svg.setAttribute("overflow", "visible");
  const nodesLayer = el("div", "behavior-nodes");
  world.append(svg, nodesLayer);
  viewport.append(world);
  const empty = el("div", "behavior-empty");
  empty.append(
    el("strong", "", "从一个交互开始"),
    el("p", "", "添加事件、状态和属性节点，将它们连接起来。"),
    btn("创建点击展开示例", "添加完整交互", addExample, "btn-primary"),
  );
  viewport.append(empty);
  const inspector = el("aside", "behavior-inspector");
  inspector.setAttribute("aria-label", "行为节点属性");
  body.append(library, viewport, inspector);
  const message = el("div", "behavior-message");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const footer = el("div", "modal-foot behavior-foot"),
    hint = el(
      "span",
      "behavior-help",
      "中键 / 空格拖动画布 · 滚轮缩放 · Delete 删除 · F 适应",
    );
  const check = btn("检查行为", "检查所有连线及生成的 CustomVina 语法", () =>
    checkDraft(),
  );
  const cancel = btn("取消", "放弃未应用的节点编辑", requestClose, "btn-ghost");
  const save = btn("应用行为", "校验并将行为写入工程", commit, "btn-primary");
  footer.append(hint, check, cancel, save);
  dialog.append(head, toolbar, body, message, footer);
  document.body.append(dialog);

  function tell(text, error = false) {
    message.textContent = text;
    message.classList.toggle("error", error);
  }
  function targetView() {
    return selectedPath && selectedPath.split(".")[0] === component
      ? selectedPath
      : views.find((p) => p.split(".")[0] === component) || "";
  }
  function visibleNodes() {
    const term = nodeSearch.value.trim().toLowerCase();
    const visible = new Set(
      draft.nodes
        .filter(
          (n) =>
            n.component === component &&
            (!term ||
              (B.NODE_TYPES[n.type].title + " " + label(n))
                .toLowerCase()
                .includes(term)),
        )
        .map((n) => n.id),
    );
    if (term) {
      const matches = new Set(visible);
      for (const edge of draft.edges)
        if (matches.has(edge.from) || matches.has(edge.to)) {
          visible.add(edge.from);
          visible.add(edge.to);
        }
    }
    // Include external sources directly connected into this component.
    for (const edge of draft.edges)
      if (visible.has(edge.to)) visible.add(edge.from);
    return draft.nodes.filter((n) => visible.has(n.id));
  }
  function record(text) {
    if (history.commit(draft, text)) changed = true;
    discardArmed = false;
    cancel.textContent = "取消";
    tell(text);
    render();
  }
  function edit(fn, text) {
    const before = V.clone(draft);
    try {
      fn();
      B.validateGraphShape(draft);
      record(text);
    } catch (error) {
      draft = before;
      tell(error.message, true);
      render();
    }
  }
  function navigate(forward) {
    const next = forward ? history.redo() : history.undo();
    if (!next) return;
    draft = next;
    changed = true;
    selected = draft.nodes.some((n) => n.id === selected) ? selected : null;
    selectedEdge = null;
    wire = null;
    tell(forward ? "已重做节点编辑" : "已撤销节点编辑");
    render();
  }
  function renderCatalog() {
    catalog.replaceChildren();
    let group = "";
    for (const [type, def] of Object.entries(B.NODE_TYPES)) {
      if (!(def.title + def.hint + def.group).includes(search.value.trim()))
        continue;
      if (def.group !== group) {
        catalog.append(el("div", "behavior-category", def.group));
        group = def.group;
      }
      const b = btn(def.title, def.hint, () => add(type), "behavior-add");
      b.dataset.addBehavior = type;
      b.prepend(el("span", "behavior-add-mark", "+"));
      catalog.append(b);
    }
  }
  function add(type) {
    nodeSearch.value = "";
    edit(() => {
      const n = B.newNode(
        type,
        component,
        targetView(),
        Math.round((viewport.clientWidth / 2 - pan.x) / scale),
        Math.round((viewport.clientHeight / 2 - pan.y) / scale),
      );
      if (type === "state") {
        let i = 1,
          path = n.path;
        while (
          draft.nodes.some(
            (other) => other.type === "state" && other.path === path,
          ) ||
          idx.byPath.has(path)
        )
          path = n.path + ++i;
        n.path = path;
      }
      draft.nodes.push(n);
      selected = n.id;
      selectedEdge = null;
    }, "已添加" + B.NODE_TYPES[type].title);
  }
  function addExample() {
    nodeSearch.value = "";
    const target = targetView();
    if (!target) {
      tell("请先在编辑器中为当前组件添加绘制节点。", true);
      return;
    }
    edit(() => {
      const x = Math.round((50 - pan.x) / scale),
        y = Math.max(0, ...visibleNodes().map((n) => n.y + height(n))) + 60;
      const state = B.newNode("state", component, target, x, y + 160);
      let i = 1;
      while (
        draft.nodes.some((n) => n.path === state.path) ||
        idx.byPath.has(state.path)
      )
        state.path = component + ".state.expanded" + ++i;
      const event = B.newNode("event", component, target, x, y);
      const toggle = {
        ...B.newNode("toggle", component, target, x + 290, y),
        path: state.path,
      };
      const expr = {
        ...B.newNode("expression", component, target, x + 290, y + 160),
        code: "${a} ? 240 : 120",
      };
      const bind = {
        ...B.newNode("bind", component, target, x + 580, y + 160),
        path: target + ".width",
        fallback: V.property(idx.byPath.get(target), "width")?.raw || "120",
      };
      if (
        draft.edges.some(
          (e) =>
            draft.nodes.find((n) => n.id === e.to)?.path === bind.path &&
            draft.nodes.find((n) => n.id === e.to)?.type === "bind",
        )
      )
        throw new Error("当前组件宽度已有连线，请先断开该属性的连线。");
      if (
        draft.edges.some(
          (e) =>
            draft.nodes.find((n) => n.id === e.from)?.target === target &&
            draft.nodes.find((n) => n.id === e.to)?.type === "toggle",
        )
      )
        throw new Error("当前组件已有点击状态切换，请编辑已有节点。");
      draft.nodes.push(event, state, toggle, expr, bind);
      B.connect(draft, event.id, toggle.id, "event");
      B.connect(draft, state.id, expr.id, "a");
      B.connect(draft, expr.id, bind.id, "value");
      selected = expr.id;
    }, "已创建点击展开交互：点击在 120 / 240 DIP 宽度间切换");
    fit();
  }
  function portButton(n, direction, port) {
    const output = direction === "out",
      kind = output ? B.outputOf(n) : port.kind;
    const b = btn(
      "",
      `${output ? "输出" : "输入"}：${output ? (kind === "event" ? "事件" : "数据") : port.label}，点击或拖动连线`,
      () => {},
      "behavior-port " + kind,
    );
    b.dataset.node = n.id;
    b.dataset.direction = direction;
    b.dataset.port = output ? "out" : port.key;
    b.setAttribute(
      "aria-label",
      `${B.NODE_TYPES[n.type].title} ${label(n)} ${output ? "输出" : port.label + "输入"}`,
    );
    const isConnected = output
      ? draft.edges.some((e) => e.from === n.id)
      : draft.edges.some((e) => e.to === n.id && e.port === port.key);
    b.classList.toggle("connected", isConnected);
    if (
      wire?.node === n.id &&
      wire.direction === direction &&
      (output || wire.port === port.key)
    )
      b.classList.add("pending");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.detail === 0) choosePort(b);
    });
    return b;
  }
  function choosePort(b) {
    const current = {
      node: b.dataset.node,
      direction: b.dataset.direction,
      port: b.dataset.port,
    };
    if (!wire) {
      wire = current;
      tell(
        "选择另一节点的" +
          (current.direction === "out" ? "输入" : "输出") +
          "端口；Esc 取消。",
      );
      renderNodes();
      return;
    }
    if (
      wire.node === current.node &&
      wire.direction === current.direction &&
      wire.port === current.port
    ) {
      wire = null;
      renderNodes();
      return;
    }
    if (wire.direction === current.direction) {
      wire = current;
      renderNodes();
      return;
    }
    const out = wire.direction === "out" ? wire : current,
      input = wire.direction === "in" ? wire : current;
    edit(() => {
      B.connect(draft, out.node, input.node, input.port);
      wire = null;
    }, "已连接节点");
  }
  function renderNodes() {
    nodesLayer.replaceChildren();
    const visible = visibleNodes();
    empty.hidden = visible.length > 0;
    for (const node of visible) {
      const card = el("div", "behavior-node");
      card.dataset.behaviorNode = node.id;
      card.dataset.type = node.type;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute(
        "aria-label",
        B.NODE_TYPES[node.type].title + " " + label(node),
      );
      card.classList.toggle("selected", node.id === selected);
      card.style.left = node.x + "px";
      card.style.top = node.y + "px";
      const header = el("div", "behavior-node-head");
      header.append(
        el(
          "span",
          "behavior-node-dot " + (node.type === "event" ? "event" : ""),
        ),
        el("strong", "", B.NODE_TYPES[node.type].title),
      );
      const detail = el("div", "behavior-node-detail", short(label(node)));
      detail.title = label(node);
      card.append(header, detail);
      const ports = el("div", "behavior-node-ports");
      const ins = B.inputsOf(node),
        out = B.outputOf(node),
        count = Math.max(1, ins.length);
      for (let i = 0; i < count; i++) {
        const row = el("div", "behavior-port-row"),
          left = el("span", "behavior-port-side");
        if (ins[i])
          left.append(
            portButton(node, "in", ins[i]),
            el("span", "", ins[i].label),
          );
        row.append(left);
        if (out && i === 0) {
          const right = el("span", "behavior-port-side");
          right.append(
            el(
              "span",
              "",
              out === "event"
                ? node.event === "hold"
                  ? "长按"
                  : "点击"
                : "值",
            ),
            portButton(node, "out"),
          );
          row.append(right);
        }
        ports.append(row);
      }
      card.append(ports);
      card.addEventListener("dblclick", () => focusNode(node.id));
      card.addEventListener("keydown", (event) => {
        if (event.target === card && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          selected = node.id;
          selectedEdge = null;
          renderInspector();
        }
      });
      card.addEventListener("click", (event) => {
        if (event.target.closest(".behavior-port")) return;
        selected = node.id;
        selectedEdge = null;
        nodesLayer
          .querySelectorAll(".behavior-node")
          .forEach((n) =>
            n.classList.toggle("selected", n.dataset.behaviorNode === selected),
          );
        renderInspector();
        drawWires();
      });
      nodesLayer.append(card);
    }
    summary.textContent = `${visible.length} 节点 · ${draft.edges.filter((e) => visible.some((n) => n.id === e.to)).length} 连线`;
    requestDraw();
  }
  function drawWires() {
    svg.replaceChildren();
    const visible = new Map(visibleNodes().map((n) => [n.id, n]));
    for (const edge of draft.edges) {
      const from = visible.get(edge.from),
        to = visible.get(edge.to);
      if (!from || !to) continue;
      const port = B.inputsOf(to).findIndex((p) => p.key === edge.port);
      const x1 = from.x + WIDTH,
        y1 = from.y + 75,
        x2 = to.x,
        y2 = to.y + 75 + Math.max(0, port) * 26;
      const curve = Math.max(60, Math.abs(x2 - x1) * 0.45);
      const path = document.createElementNS(NS, "path");
      path.setAttribute(
        "d",
        `M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}`,
      );
      path.setAttribute(
        "class",
        "behavior-wire " +
          (B.outputOf(from) === "event" ? "event " : "") +
          (selectedEdge === edge ? "selected" : ""),
      );
      const hit = path.cloneNode();
      hit.setAttribute("class", "behavior-wire-hit");
      hit.addEventListener("click", (event) => {
        event.stopPropagation();
        selectedEdge = edge;
        selected = null;
        renderInspector();
        drawWires();
      });
      svg.append(path, hit);
    }
    if (wire?.point) {
      const node = visible.get(wire.node);
      if (node) {
        const isOut = wire.direction === "out",
          at = Math.max(
            0,
            B.inputsOf(node).findIndex((p) => p.key === wire.port),
          );
        const path = document.createElementNS(NS, "path");
        path.setAttribute(
          "d",
          `M${node.x + (isOut ? WIDTH : 0)},${node.y + 75 + (isOut ? 0 : at * 26)} L${wire.point.x},${wire.point.y}`,
        );
        path.setAttribute("class", "behavior-wire preview");
        svg.append(path);
      }
    }
  }
  function requestDraw() {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!closed) drawWires();
      });
  }
  function field(
    name,
    value,
    change,
    { multiline = false, options, list } = {},
  ) {
    const row = el("label", "behavior-field"),
      caption = el("span", "", name);
    const input = el(
      options ? "select" : multiline ? "textarea" : "input",
      "ctl",
    );
    if (options)
      for (const [key, text] of options) {
        const option = el("option", "", text);
        option.value = key;
        input.append(option);
      }
    input.value = value || "";
    input.setAttribute("aria-label", name);
    input.spellcheck = false;
    if (multiline) {
      input.rows = 5;
      input.classList.add("behavior-code");
    }
    if (list) {
      const data = el("datalist");
      data.id =
        "behaviorSuggestions" + inspector.querySelectorAll("datalist").length;
      for (const text of list) {
        const option = el("option");
        option.value = text;
        data.append(option);
      }
      input.setAttribute("list", data.id);
      row.append(data);
    }
    input.addEventListener("change", () =>
      edit(() => change(input.value.trim()), "已修改" + name),
    );
    row.append(caption, input);
    inspector.append(row);
    return input;
  }
  function renderInspector() {
    inspector.replaceChildren();
    if (selectedEdge) {
      inspector.append(
        el("h4", "", "连线"),
        el(
          "p",
          "behavior-inspector-hint",
          "删除连线后，属性回到断开前的静态值，事件停止调用对应动作。",
        ),
        btn("删除连线", "断开选中的连线", remove, "btn-ghost"),
      );
      return;
    }
    const node = draft.nodes.find((n) => n.id === selected);
    if (!node) {
      inspector.append(
        el("h4", "", "节点属性"),
        el(
          "p",
          "behavior-inspector-hint",
          "选择节点编辑参数，选择连线可断开连接。",
        ),
        el(
          "div",
          "behavior-inspector-rule",
          "所有交互生成标准 Vina 语法。状态按实例隔离；悬停使用 hovered / hoverProgress。长按动作不会触发点击切换。",
        ),
      );
      return;
    }
    const def = B.NODE_TYPES[node.type];
    inspector.append(
      el("h4", "", def.title),
      el("p", "behavior-inspector-hint", def.hint),
    );
    if (node.type === "event") {
      field(
        "目标组件",
        node.target,
        (v) => {
          node.target = v;
        },
        { list: views.filter((p) => p.split(".")[0] === component) },
      );
      field(
        "触发方式",
        node.event,
        (v) => {
          node.event = v;
        },
        {
          options: [
            ["click", "点击"],
            ["hold", "长按（默认 400 ms）"],
          ],
        },
      );
    }
    if (["state", "reference", "bind", "toggle"].includes(node.type)) {
      const paths =
        node.type === "toggle"
          ? draft.nodes.filter((n) => n.type === "state").map((n) => n.path)
          : node.type === "reference"
            ? [
                ...draft.nodes
                  .filter((n) => n.type === "state")
                  .map((n) => n.path),
                ...views
                  .filter((p) => p.split(".")[0] === component)
                  .flatMap((p) => [p + ".hovered", p + ".hoverProgress"]),
                ...Object.keys(inputs),
              ]
            : undefined;
      field(
        node.type === "bind" ? "目标属性路径" : "变量完整路径",
        node.path,
        (v) => {
          node.path = v;
        },
        { list: paths },
      );
    }
    if (["state", "value", "expression", "condition"].includes(node.type)) {
      if (node.type === "expression")
        field(
          "表达式模板",
          "",
          (v) => {
            if (v) {
              node.code = v;
              draft.edges = draft.edges.filter(
                (e) =>
                  e.to !== node.id ||
                  B.inputsOf(node).some((p) => p.key === e.port),
              );
            }
          },
          {
            options: [
              ["", "选择运算…"],
              ["${a} + ${b}", "加法 / 拼接"],
              ["${a} * ${b}", "乘法"],
              ["${a} > ${b}", "比较"],
              ["${a} && ${b}", "逻辑与"],
              ["!${a}", "取反"],
              ["clamp(${a}, ${b}, ${c})", "限制范围"],
              ["${a} ? ${b} : ${c}", "条件值"],
            ],
          },
        );
      field(
        node.type === "state" ? "默认值" : "Vina 表达式",
        node.code,
        (v) => {
          node.code = v;
          draft.edges = draft.edges.filter(
            (e) =>
              e.to !== node.id ||
              B.inputsOf(node).some((p) => p.key === e.port),
          );
        },
        { multiline: true },
      );
    }
    if (node.type === "action") {
      field(
        "原生动作",
        node.action,
        (v) => {
          node.action = v;
          delete node.code;
        },
        { options: schema.actions.map((a) => [a, a]) },
      );
      if (node.code && V.references(V.parseExpression(node.code)).length)
        field(
          "动作表达式",
          node.code,
          (v) => {
            node.code = v;
          },
          { multiline: true },
        );
    }
    if (node.type === "bind")
      field("断开后的静态值", node.fallback || "1", (v) => {
        V.parseExpression(v);
        node.fallback = v;
      });
    const connections = draft.edges.filter(
      (e) => e.from === node.id || e.to === node.id,
    );
    if (connections.length) {
      inspector.append(el("h4", "behavior-connections-title", "连接"));
      for (const edge of connections) {
        const other = draft.nodes.find(
          (n) => n.id === (edge.from === node.id ? edge.to : edge.from),
        );
        const row = el("div", "behavior-connection");
        row.append(
          btn(
            short(label(other)),
            "定位相连节点",
            () => focusNode(other.id),
            "behavior-connection-link",
          ),
          btn("×", "断开此连线", () =>
            edit(() => {
              draft.edges = draft.edges.filter((e) => e !== edge);
            }, "已断开连线"),
          ),
        );
        inspector.append(row);
      }
    }
    inspector.append(
      btn(
        "删除节点",
        "删除节点及其连线 Delete",
        remove,
        "btn-ghost behavior-delete",
      ),
    );
  }
  function render() {
    undo.disabled = !history.canUndo;
    redo.disabled = !history.canRedo;
    save.textContent = changed ? "应用行为 *" : "应用行为";
    renderNodes();
    renderInspector();
    transform();
  }
  function transform() {
    world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
    viewport.style.backgroundSize = `${24 * scale}px ${24 * scale}px`;
    viewport.style.backgroundPosition = `${pan.x}px ${pan.y}px`;
    zoomLabel.textContent = Math.round(scale * 100) + "%";
  }
  function focusNode(id) {
    const node = draft.nodes.find((n) => n.id === id);
    if (!node) return;
    selected = id;
    selectedEdge = null;
    scale = 1;
    pan = {
      x: viewport.clientWidth / 2 - node.x - WIDTH / 2,
      y: viewport.clientHeight / 2 - node.y - height(node) / 2,
    };
    render();
  }
  function zoomAt(
    next,
    x = viewport.clientWidth / 2,
    y = viewport.clientHeight / 2,
  ) {
    next = Math.max(0.12, Math.min(2, next));
    pan = {
      x: x - ((x - pan.x) * next) / scale,
      y: y - ((y - pan.y) * next) / scale,
    };
    scale = next;
    transform();
  }
  function fit() {
    const nodes = visibleNodes();
    if (!nodes.length) {
      scale = 1;
      pan = { x: 48, y: 42 };
      transform();
      return;
    }
    const left = Math.min(...nodes.map((n) => n.x)),
      top = Math.min(...nodes.map((n) => n.y));
    const right = Math.max(...nodes.map((n) => n.x + WIDTH)),
      bottom = Math.max(...nodes.map((n) => n.y + height(n)));
    scale = Math.max(
      0.12,
      Math.min(
        1,
        (viewport.clientWidth - 80) / Math.max(1, right - left),
        (viewport.clientHeight - 80) / Math.max(1, bottom - top),
      ),
    );
    pan = {
      x: (viewport.clientWidth - (right - left) * scale) / 2 - left * scale,
      y: 40 - top * scale,
    };
    transform();
  }
  function remove() {
    if (!selected && !selectedEdge) return;
    edit(() => {
      if (selectedEdge)
        draft.edges = draft.edges.filter((e) => e !== selectedEdge);
      else {
        draft.nodes = draft.nodes.filter((n) => n.id !== selected);
        draft.edges = draft.edges.filter(
          (e) => e.from !== selected && e.to !== selected,
        );
      }
      selected = null;
      selectedEdge = null;
      wire = null;
    }, "已删除所选节点或连线");
  }
  function checkDraft() {
    try {
      const result = B.compileGraph(project, standard, draft, inputs, schema);
      validate(result, standard, inputs, schema);
      tell(
        "校验通过，可应用并在编辑器中运行预览。未连接的逻辑节点保留在工程中。框架动作在 Pogget 中执行。",
      );
      return result;
    } catch (error) {
      tell(error.message, true);
      return null;
    }
  }
  function commit() {
    // Flush the focused field before validating/applying.
    dialog.querySelector(":focus")?.blur();
    const next = checkDraft();
    if (!next) return;
    if (apply(next)) {
      changed = false;
      dialog.close();
      notify("行为节点已应用，可点击“运行”测试交互");
    } else tell("写入未完成。若工程已从外部更新，请关闭弹窗后重新打开。", true);
  }
  function requestClose() {
    dialog.querySelector(":focus")?.blur();
    if (changed && !discardArmed) {
      discardArmed = true;
      tell(
        "尚有未应用的修改。点击“应用行为”保存，或再次点击关闭 / 取消放弃修改。",
        true,
      );
      cancel.textContent = "放弃修改";
      return;
    }
    dialog.close();
  }
  function point(event) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - pan.x) / scale,
      y: (event.clientY - rect.top - pan.y) / scale,
    };
  }
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    const port = event.target.closest(".behavior-port"),
      card = event.target.closest(".behavior-node");
    if (port && event.button === 0 && !space) {
      gesture = {
        kind: "wire",
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        port,
        moved: false,
      };
    } else if (
      event.button === 1 ||
      space ||
      (!card && !event.target.closest("path"))
    ) {
      event.preventDefault();
      viewport.focus();
      gesture = {
        kind: "pan",
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pan: { ...pan },
      };
    } else if (card && event.button === 0) {
      selected = card.dataset.behaviorNode;
      selectedEdge = null;
      const node = draft.nodes.find((n) => n.id === selected);
      gesture = {
        kind: "node",
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        node,
        start: { x: node.x, y: node.y },
        moved: false,
      };
      viewport.focus();
      renderInspector();
      nodesLayer
        .querySelectorAll(".behavior-node")
        .forEach((n) => n.classList.toggle("selected", n === card));
    }
    if (gesture) viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (gesture?.id === event.pointerId) {
      const dx = event.clientX - gesture.x,
        dy = event.clientY - gesture.y;
      if (gesture.kind === "pan") {
        pan = { x: gesture.pan.x + dx, y: gesture.pan.y + dy };
        transform();
      }
      if (gesture.kind === "node") {
        if (Math.hypot(dx, dy) > 3) gesture.moved = true;
        if (!gesture.moved) return;
        gesture.node.x = Math.max(
          -100000,
          Math.min(100000, Math.round(gesture.start.x + dx / scale)),
        );
        gesture.node.y = Math.max(
          -100000,
          Math.min(100000, Math.round(gesture.start.y + dy / scale)),
        );
        const card = nodesLayer.querySelector(
          `[data-behavior-node="${gesture.node.id}"]`,
        );
        if (card) {
          card.style.left = gesture.node.x + "px";
          card.style.top = gesture.node.y + "px";
        }
        requestDraw();
      }
      if (gesture.kind === "wire" && Math.hypot(dx, dy) > 4) {
        gesture.moved = true;
        wire = {
          node: gesture.port.dataset.node,
          direction: gesture.port.dataset.direction,
          port: gesture.port.dataset.port,
          point: point(event),
        };
        requestDraw();
      }
    } else if (wire) {
      wire.point = point(event);
      requestDraw();
    }
  });
  const finish = (event, cancelGesture = false) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture;
    gesture = null;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
    if (g.kind === "node" && g.moved) {
      if (cancelGesture) {
        g.node.x = g.start.x;
        g.node.y = g.start.y;
        render();
      } else record("已移动节点");
    }
    if (g.kind === "wire") {
      if (cancelGesture) {
        wire = null;
        renderNodes();
        return;
      }
      if (g.moved) {
        const port = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest(".behavior-port");
        if (port && port.dataset.direction !== wire?.direction)
          choosePort(port);
        else {
          wire = null;
          renderNodes();
        }
      } else choosePort(g.port);
    }
  };
  viewport.addEventListener("pointerup", (e) => finish(e));
  viewport.addEventListener("pointercancel", (e) => finish(e, true));
  viewport.addEventListener("lostpointercapture", (e) => finish(e, true));
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAt(
        scale * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    { passive: false },
  );
  viewport.addEventListener("contextmenu", (event) => event.preventDefault());
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const editing = event.target.closest("input,textarea,select"),
      mod = event.ctrlKey || event.metaKey;
    if (event.key === "Escape") {
      event.preventDefault();
      if (wire) {
        wire = null;
        tell("已取消连线");
        renderNodes();
      } else requestClose();
      return;
    }
    if (editing) return;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      navigate(event.shiftKey);
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      navigate(true);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove();
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      fit();
    } else if (event.code === "Space") {
      event.preventDefault();
      space = true;
      viewport.classList.add("panning");
    } else if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      commit();
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    if (event.code === "Space") {
      space = false;
      viewport.classList.remove("panning");
    }
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
  const resetKeys = () => {
    space = false;
    viewport.classList.remove("panning");
    if (gesture) finish({ pointerId: gesture.id }, true);
  };
  window.addEventListener("blur", resetKeys);
  const unload = (event) => {
    dialog.querySelector(":focus")?.blur();
    if (changed) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", unload);
  const observer = new ResizeObserver(() => {
    if (!closed) transform();
  });
  observer.observe(viewport);
  dialog.addEventListener(
    "close",
    () => {
      closed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("blur", resetKeys);
      window.removeEventListener("beforeunload", unload);
      dialog.remove();
      document.getElementById("behaviorBtn")?.focus();
    },
    { once: true },
  );
  search.addEventListener("input", renderCatalog);
  nodeSearch.addEventListener("input", () => {
    selected = null;
    selectedEdge = null;
    wire = null;
    render();
    fit();
  });
  scope.addEventListener("change", () => {
    component = scope.value;
    nodeSearch.value = "";
    selected = null;
    selectedEdge = null;
    wire = null;
    render();
    fit();
  });
  dialog.showModal();
  renderCatalog();
  render();
  fit();
  scope.focus();
  tell(
    "选择组件查看已有行为。编辑继承行为会在当前工程生成覆盖；应用后支持工程撤销与自动保存。",
  );
}
