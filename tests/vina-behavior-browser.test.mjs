import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browserSession } from "./browser-harness.mjs";

const source =
  'Card { view { type: "button", x: 30, y: 30, width: 120, height: 40, label: "点击展开", textLiteral: true, background: rgb(82,121,251), color: rgb(255,255,255), radius: 10, holdAction: "pogget.action.view.grid", holdDelay: 0.15, transition: 0.12, hover { opacity: 0.8 } } }';
const byText = (text) =>
  `[...document.querySelectorAll('#behaviorDialog button')].find(n=>n.textContent===${JSON.stringify(text)})`;
const buttonClick = (text) => `${byText(text)}.click()`;
test(
  "behavior graph end-to-end: real pointer wiring, validation, atomic apply, preview, history, reload and themes",
  {
    skip:
      !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable",
    timeout: 60000,
  },
  async () =>
    browserSession(
      async ({ call, evaluate, waitFor, click, mouse, origin, errors }) => {
        const navigate = async (text) => {
          await call("Page.navigate", {
            url:
              origin +
              "/index.html#c=" +
              Buffer.from(text).toString("base64url"),
          });
          await waitFor('document.documentElement.dataset.ready === "true"');
        };
        const screenshot = async (name) => {
          if (!process.env.VINA_SCREENSHOT_DIR) return;
          await mkdir(process.env.VINA_SCREENSHOT_DIR, { recursive: true });
          const shot = await call("Page.captureScreenshot", { format: "png" });
          await writeFile(
            join(process.env.VINA_SCREENSHOT_DIR, name + ".png"),
            Buffer.from(shot.data, "base64"),
          );
        };
        const edit = async (name, value) =>
          evaluate(
            `(() => {const n=document.querySelector('#behaviorDialog [aria-label=${JSON.stringify(name)}]'); n.value=${JSON.stringify(value)}; n.dispatchEvent(new Event('change',{bubbles:true}));})()`,
          );
        await navigate(source);
        const before = await evaluate("window.vinaEditor.source");
        await click("#behaviorBtn");
        await waitFor('document.querySelector("#behaviorDialog")?.open');
        assert.equal(
          await evaluate(
            'document.querySelectorAll("[data-add-behavior]").length',
          ),
          9,
        );
        assert.equal(
          await evaluate(
            'document.querySelector("#behaviorBtn use").getAttribute("href")',
          ),
          "vendor/fontawesome/fa6.svg#fa-arrow-pointer",
        );
        assert.ok(
          await evaluate(
            'document.querySelector("#behaviorDialog").getBoundingClientRect().width > 1400',
          ),
        );
        await evaluate(buttonClick("点击展开示例"));
        assert.equal(
          await evaluate(
            'document.querySelectorAll(".behavior-node[data-type=toggle]").length',
          ),
          1,
        );
        const expr = await evaluate(
          '[...document.querySelectorAll(".behavior-node[data-type=expression]")].find(n=>n.querySelector(".behavior-node-detail").textContent==="${a} ? 240 : 120").dataset.behaviorNode',
        );
        const state = await evaluate(
          'document.querySelector(".behavior-node[data-type=state]").dataset.behaviorNode',
        );
        const exprSelector = `.behavior-node[data-behavior-node="${expr}"]`;
        await click(exprSelector);
        await edit("Vina 表达式", "${a} ? 240 :");
        await evaluate(buttonClick("应用行为 *"));
        assert.equal(await evaluate("window.vinaEditor.source"), before);
        assert.ok(
          await evaluate(
            'document.querySelector(".behavior-message").classList.contains("error")',
          ),
        );
        await edit("Vina 表达式", "${a} ? 240 : 120");

        // Select and disconnect a wire through the inspector, then reconnect with
        // actual browser pointer input (pointer capture included).
        await click(exprSelector);
        await evaluate(
          'document.querySelector(".behavior-connection .mini-btn").click()',
        );
        const outPort = `.behavior-node[data-behavior-node="${state}"] .behavior-port[data-direction=out]`;
        const inPort = `${exprSelector} .behavior-port[data-port=a]`;
        const pos = async (s) =>
          evaluate(
            `(() => {const r=document.querySelector(${JSON.stringify(s)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
          );
        await evaluate(
          "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        );
        const a = await pos(outPort),
          b = await pos(inPort);
        await mouse("mouseMoved", a);
        await mouse("mousePressed", a);
        await mouse(
          "mouseMoved",
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          { buttons: 1 },
        );
        await waitFor('!!document.querySelector(".behavior-wire.preview")');
        await mouse("mouseMoved", b, { buttons: 1 });
        await mouse("mouseReleased", b);
        assert.equal(
          await evaluate(
            `document.querySelector(${JSON.stringify(inPort)}).classList.contains('connected')`,
          ),
          true,
        );

        // Add a constant and verify modal-local undo/redo, without changing the board.
        await click('[data-add-behavior="value"]');
        const count = await evaluate(
          'document.querySelectorAll(".behavior-node").length',
        );
        await evaluate('document.querySelector(".behavior-viewport").focus()');
        await call("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "z",
          code: "KeyZ",
          modifiers: 2,
        });
        await call("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "z",
          code: "KeyZ",
          modifiers: 2,
        });
        assert.equal(
          await evaluate('document.querySelectorAll(".behavior-node").length'),
          count - 1,
        );
        await call("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "z",
          code: "KeyZ",
          modifiers: 10,
        });
        await call("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "z",
          code: "KeyZ",
          modifiers: 10,
        });
        assert.equal(
          await evaluate('document.querySelectorAll(".behavior-node").length'),
          count,
        );
        assert.equal(await evaluate("window.vinaEditor.source"), before);
        await evaluate(buttonClick("适应画布"));
        await screenshot("behavior-light");
        await evaluate(buttonClick("应用行为 *"));
        await waitFor('!document.querySelector("#behaviorDialog")');
        assert.match(
          await evaluate("window.vinaEditor.source"),
          /toggle: "Card.state.expanded"/,
        );
        assert.equal(await evaluate("window.vinaEditor.history.undo"), true);
        assert.ok(
          await evaluate(
            'JSON.parse(localStorage.getItem("customvina.project.v2")).behaviorGraph.graph.nodes.some(n=>n.id===' +
              JSON.stringify(expr) +
              ")",
          ),
        );
        // Applied graph is one board-level transaction.
        await click("#undoBtn");
        assert.equal(await evaluate("window.vinaEditor.source"), before);
        await click("#redoBtn");
        assert.match(await evaluate("window.vinaEditor.source"), /toggle:/);

        await click("#runBtn");
        const board = await evaluate(
          '(() => {const r=document.querySelector("#board").getBoundingClientRect();return {x:r.x+70,y:r.y+50}})()',
        );
        await mouse("mouseMoved", board);
        await mouse("mousePressed", board);
        await mouse("mouseReleased", board);
        assert.equal(
          await evaluate(
            'window.vinaEditor.preview.frames.find(f=>f.path==="Card.view").w',
          ),
          240,
        );
        await mouse("mousePressed", board);
        await new Promise((r) => setTimeout(r, 220));
        await mouse("mouseReleased", board);
        // Native semantics: long hold does not toggle the short-click state.
        assert.equal(
          await evaluate(
            'window.vinaEditor.preview.frames.find(f=>f.path==="Card.view").w',
          ),
          240,
        );
        await mouse("mousePressed", board);
        await mouse("mouseReleased", board);
        assert.equal(
          await evaluate(
            'window.vinaEditor.preview.frames.find(f=>f.path==="Card.view").w',
          ),
          120,
        );
        await click("#runBtn");

        await evaluate("delete document.documentElement.dataset.ready");
        await call("Page.reload");
        await waitFor('document.documentElement.dataset.ready === "true"');
        await click("#themeBtn");
        await click("#behaviorBtn");
        assert.ok(
          await evaluate(
            `!!document.querySelector(${JSON.stringify(exprSelector)})`,
          ),
        );
        assert.equal(
          await evaluate("document.documentElement.dataset.theme"),
          "dark",
        );
        await click(exprSelector);
        await evaluate(
          `document.querySelector(${JSON.stringify(exprSelector)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
        );
        assert.equal(
          await evaluate(
            'document.querySelector(".behavior-zoom").textContent',
          ),
          "100%",
        );
        await screenshot("behavior-dark");
        await edit("Vina 表达式", "${a} ? 300 : 120");
        const saved = await evaluate("window.vinaEditor.source");
        await evaluate(buttonClick("取消"));
        assert.equal(
          await evaluate('!!document.querySelector("#behaviorDialog")'),
          true,
        );
        await evaluate(buttonClick("放弃修改"));
        await waitFor('!document.querySelector("#behaviorDialog")');
        assert.equal(
          await evaluate('!!document.querySelector("#behaviorDialog")'),
          false,
        );
        assert.equal(await evaluate("window.vinaEditor.source"), saved);

        // Small screens keep the canvas, library and inspector reachable.
        await call("Emulation.setDeviceMetricsOverride", {
          width: 500,
          height: 760,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await click("#behaviorBtn");
        assert.ok(
          await evaluate(
            'document.querySelector("#behaviorDialog").scrollWidth <= document.querySelector("#behaviorDialog").clientWidth',
          ),
        );
        await screenshot("behavior-narrow");
        assert.deepEqual(errors, []);
      },
    ),
);

test(
  "native standard, inherited overrides, invalid runtime rollback and stale modal protection",
  {
    skip:
      !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable",
    timeout: 60000,
  },
  async () =>
    browserSession(
      async ({ call, evaluate, waitFor, click, mouse, origin, errors }) => {
        const importSource = async (text, initial = false) => {
          const hash = "#c=" + Buffer.from(text).toString("base64url");
          if (initial) {
            await call("Page.navigate", { url: origin + "/index.html" + hash });
            await waitFor('document.documentElement.dataset.ready === "true"');
          } else {
            await evaluate(`location.hash=${JSON.stringify(hash)}`);
            await waitFor(`window.vinaEditor.source===${JSON.stringify(text)}`);
          }
        };
        await importSource('Preset { dependsOn: "Pogget_Std" }', true);
        const original = await evaluate("window.vinaEditor.source");
        await click("#behaviorBtn");
        await waitFor('document.querySelector("#behaviorDialog")?.open');
        await evaluate(
          `(() => {const n=document.querySelector('[aria-label="行为所属组件"]');n.value='TitleButtons';n.dispatchEvent(new Event('change'));})()`,
        );
        await evaluate(buttonClick("节点明细"));
        const count = await evaluate(
          'document.querySelectorAll(".behavior-node").length',
        );
        assert.ok(count > 10);
        await evaluate(
          `(() => {const n=document.querySelector('[aria-label="查找画布行为节点"]');n.value='opacity';n.dispatchEvent(new Event('input'));})()`,
        );
        assert.ok(
          (await evaluate(
            'document.querySelectorAll(".behavior-node").length',
          )) < count,
        );
        await click('[data-add-behavior="value"]');
        await evaluate(buttonClick("应用行为 *"));
        await waitFor('!document.querySelector("#behaviorDialog")');
        assert.equal(await evaluate("window.vinaEditor.source"), original);
        assert.ok(
          await evaluate(
            "window.vinaEditor.project.behaviorGraph.graph.nodes.length > 3000",
          ),
        );

        const invalid =
          'Card { state { expanded: false }, view { type: "button", x: 30, y: 30, width: ${state.expanded} ? -1 : 120, height: 40, toggle: "state.expanded" } }';
        await importSource(invalid);
        await click("#runBtn");
        const p = await evaluate(
          '(() => {const r=document.querySelector("#board").getBoundingClientRect();return {x:r.x+70,y:r.y+50}})()',
        );
        await mouse("mouseMoved", p);
        await mouse("mousePressed", p);
        await mouse("mouseReleased", p);
        assert.equal(
          await evaluate(
            'window.vinaEditor.preview.frames.find(f=>f.path==="Card.view").w',
          ),
          120,
        );
        assert.ok(
          await evaluate(
            '[...document.querySelectorAll(".toast")].some(n=>n.textContent.includes("交互未应用"))',
          ),
        );
        await click("#runBtn");
        const valid = invalid.replace("? -1", "? 240");
        await importSource(valid);
        await click("#runBtn");
        await mouse("mouseMoved", p);
        await mouse("mousePressed", p);
        await mouse("mouseMoved", { x: p.x + 200, y: p.y }, { buttons: 1 });
        await mouse("mouseMoved", p, { buttons: 1 });
        await mouse("mouseReleased", p);
        assert.equal(
          await evaluate(
            'window.vinaEditor.preview.frames.find(f=>f.path==="Card.view").w',
          ),
          120,
        );
        await mouse("mousePressed", p);
        await evaluate('window.dispatchEvent(new Event("blur"))');
        await mouse("mouseReleased", p);
        assert.equal(
          await evaluate(
            'window.vinaEditor.preview.frames.find(f=>f.path==="Card.view").w',
          ),
          120,
        );
        await click("#runBtn");

        await click("#behaviorBtn");
        await click('[data-add-behavior="value"]');
        const replacement = "Replacement { view { width: 80, height: 30 } }";
        await importSource(replacement);
        await evaluate(buttonClick("应用行为 *"));
        assert.equal(await evaluate("window.vinaEditor.source"), replacement);
        assert.equal(
          await evaluate(
            'document.querySelector(".behavior-message").classList.contains("error")',
          ),
          true,
        );
        assert.deepEqual(errors, []);
      },
    ),
);
