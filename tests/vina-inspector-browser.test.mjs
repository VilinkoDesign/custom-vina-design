import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browserSession } from "./browser-harness.mjs";

const options = {
  skip: !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable",
  timeout: 60000,
};
const source = `Demo { view { type: "group", width: 320, height: 250,
  Button { type: "button", x: 20, y: 20, width: 100, height: 40, label: "显示 / 隐藏", textLiteral: true, background: rgb(80,120,200) },
  Rect { type: "rect", x: 160, y: 20, width: 100, height: 80, background: rgb(80,150,120) },
  HoverRect { type: "rect", x: 20, y: 120, width: 100, height: 60, background: rgb(160,120,180) }
} }
Observer { view { type: "rect", x: 20, y: 280, width: \${Demo.view.Button.width} + 10, height: 40,
  visible: !\${Demo.view.Button.hovered}, label: "literal \${Demo.view.Button.width}", textLiteral: true
} }`;
const frame = (path) =>
  `window.vinaEditor.preview.frames.find(f=>f.path===${JSON.stringify(path)})`;

function helpers(session) {
  const { evaluate, click, waitFor, call } = session;
  return {
    set: (label, value) =>
      evaluate(
        `(() => {const root=document.querySelector('dialog[open]:not([inert])')||document,n=root.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!n) throw Error('Missing field: '+${JSON.stringify(label)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      ),
    press: async (root, text) => {
      await evaluate(
        `(() => {document.querySelectorAll('[data-browser-target]').forEach(n=>n.removeAttribute('data-browser-target'));const n=[...document.querySelectorAll(${JSON.stringify(root + " button")})].find(n=>n.textContent===${JSON.stringify(text)});if(!n) throw Error('Missing button: '+${JSON.stringify(text)});n.setAttribute('data-browser-target','true');n.scrollIntoView({block:'nearest'});})()`,
      );
      await click('[data-browser-target="true"]');
    },
    select: (path) => click(`.layer-row[data-path="${path}"] .layer-name`),
    closed: () => waitFor('!document.querySelector("#editDialog").open'),
    navigate: async () => {
      await call("Page.navigate", {
        url:
          session.origin +
          "/index.html#c=" +
          Buffer.from(source).toString("base64url"),
      });
      await waitFor('document.documentElement?.dataset.ready==="true"');
    },
    shot: async (name) => {
      if (!process.env.VINA_SCREENSHOT_DIR) return;
      await mkdir(process.env.VINA_SCREENSHOT_DIR, { recursive: true });
      const shot = await call("Page.captureScreenshot", { format: "png" });
      await writeFile(
        join(process.env.VINA_SCREENSHOT_DIR, name + ".png"),
        Buffer.from(shot.data, "base64"),
      );
    },
  };
}

test(
  "new project creates a saved independent blank canvas, rejects invalid sizes and restores the previous source with undo",
  options,
  async () =>
    browserSession(async (session) => {
      const { evaluate, waitFor, click, call, errors } = session;
      const { navigate, set, press, closed, shot } = helpers(session);
      await navigate();
      const before = await evaluate("window.vinaEditor.source");
      await click("#newBtn");
      await set("工程名称", "空白测试");
      await set("画板宽度", "0");
      await press("#dialogFoot", "创建工程");
      assert.match(
        await evaluate('document.querySelector("#dialogError").textContent'),
        /120/,
      );
      assert.equal(await evaluate("window.vinaEditor.source"), before);
      await set("画板宽度", "640");
      await set("画板高度", "480");
      await press("#dialogFoot", "创建工程");
      await closed();
      assert.equal(
        await evaluate("window.vinaEditor.project.doc.roots.length"),
        0,
      );
      assert.equal(await evaluate("window.vinaEditor.project.base"), undefined);
      assert.equal(
        await evaluate("window.vinaEditor.project.linkedSource"),
        undefined,
      );
      assert.deepEqual(await evaluate("window.vinaEditor.project.board"), {
        w: 640,
        h: 480,
      });
      assert.equal(
        await evaluate("window.vinaEditor.project.name"),
        "空白测试",
      );
      await shot("new-blank-project");
      await click("#undoBtn");
      assert.equal(await evaluate("window.vinaEditor.source"), before);
      await click("#redoBtn");
      assert.equal(
        await evaluate("window.vinaEditor.project.doc.roots.length"),
        0,
      );
      await evaluate("delete document.documentElement.dataset.ready");
      await call("Page.reload");
      await waitFor('document.documentElement?.dataset.ready==="true"');
      assert.equal(
        await evaluate("window.vinaEditor.project.doc.roots.length"),
        0,
      );
      assert.equal(
        await evaluate("window.vinaEditor.project.name"),
        "空白测试",
      );
      await press("#compList", "矩形");
      assert.ok(
        await evaluate(
          'window.vinaEditor.preview.frames.some(f=>f.path==="Rect1.view")',
        ),
      );
      assert.deepEqual(errors, []);
    }),
);

test(
  "ordinary inspector authors button toggles, rectangle visibility, hover styles and bindings, graph round trip and referenced-group deletion",
  options,
  async () =>
    browserSession(async (session) => {
      const { evaluate, waitFor, click, mouse, errors } = session;
      const { navigate, set, press, closed, select, shot } = helpers(session);
      await navigate();
      await select("Demo.view.Button");
      await press("#inspBody", "新建开关变量");
      await set("开关变量名", "bad name");
      await press("#dialogFoot", "创建并绑定点击");
      assert.match(
        await evaluate('document.querySelector("#dialogError").textContent'),
        /名称/,
      );
      assert.ok(
        !(await evaluate('window.vinaEditor.source.includes("state {")')),
      );
      await set("开关变量名", "showRect");
      await press("#dialogFoot", "创建并绑定点击");
      await closed();
      assert.equal(
        await evaluate(
          'document.querySelector("[aria-label=点击切换变量]").value',
        ),
        "Demo.state.showRect",
      );
      assert.equal(
        await evaluate(
          'document.querySelector("[aria-label=开关默认值]").value',
        ),
        "false",
      );
      await select("Demo.view.Rect");
      await press("#inspBody", "添加交互绑定");
      await set("交互来源", "Demo.state.showRect");
      await press("#dialogFoot", "应用交互绑定");
      await closed();
      assert.equal(await evaluate(frame("Demo.view.Rect") + ".visible"), false);
      await shot("inspector-click-binding-light");
      await press('[data-interaction-property="visible"]', "编辑");
      assert.equal(
        await evaluate(
          'document.querySelector("[aria-label=交互关闭值]").value',
        ),
        "false",
      );
      assert.equal(
        await evaluate(
          'document.querySelector("[aria-label=交互开启值]").value',
        ),
        "true",
      );
      await press("#dialogFoot", "应用交互绑定");
      await closed();
      await select("Demo.view.HoverRect");
      await press("#inspBody", "添加交互绑定");
      await set("交互目标属性", "opacity");
      await set("交互驱动类型", "hover");
      await set("交互来源", "Demo.view.Button.hovered");
      // Invalid drafts can switch drivers without throwing from an input handler.
      await set("交互关闭值", "");
      await set("交互驱动类型", "state");
      await set("交互驱动类型", "hover");
      await set("交互来源", "Demo.view.Button.hovered");
      await set("交互关闭值", "0.3");
      await set("交互开启值", "1");
      await press("#dialogFoot", "应用交互绑定");
      await closed();
      await select("Demo.view.Button");
      await evaluate(
        '[...document.querySelectorAll("#inspBody summary")].find(n=>n.textContent==="悬停状态").parentElement.open=true',
      );
      await press("#inspBody", "添加悬停状态");
      await evaluate(
        '[...document.querySelectorAll("#inspBody summary")].find(n=>n.textContent==="悬停状态").parentElement.open=true',
      );
      await press("#inspBody", "添加悬停属性");
      await set("悬停属性", "background");
      await set("悬停属性值", "#112233");
      await press("#dialogFoot", "应用悬停属性");
      await closed();
      await click("#runBtn");
      const position = await evaluate(
        `(() => {const r=document.querySelector('#board').getBoundingClientRect(),f=${frame("Demo.view.Button")};return {x:r.x+f.x+f.w/2,y:r.y+f.y+f.h/2}})()`,
      );
      await mouse("mouseMoved", position);
      await waitFor(frame("Demo.view.HoverRect") + ".p.opacity===1");
      await waitFor(frame("Demo.view.Button") + ".p.background===3351057");
      assert.equal(await evaluate(frame("Demo.view.Rect") + ".visible"), false);
      await mouse("mousePressed", position);
      await mouse("mouseReleased", position);
      assert.equal(await evaluate(frame("Demo.view.Rect") + ".visible"), true);
      await mouse("mouseMoved", { x: 10, y: 900 });
      await waitFor(frame("Demo.view.HoverRect") + ".p.opacity===0.3");
      assert.equal(await evaluate(frame("Demo.view.Rect") + ".visible"), true);
      await mouse("mouseMoved", position);
      await mouse("mousePressed", position);
      await mouse("mouseReleased", position);
      assert.equal(await evaluate(frame("Demo.view.Rect") + ".visible"), false);
      await click("#runBtn");
      await select("Demo.view.Rect");
      const original = await evaluate("window.vinaEditor.source");
      await click("#behaviorBtn");
      await press("#behaviorDialog", "应用行为");
      await waitFor('!document.querySelector("#behaviorDialog")');
      assert.equal(await evaluate("window.vinaEditor.source"), original);
      await select("Demo.view.Button");
      await set("开关默认值", "true");
      assert.equal(await evaluate(frame("Demo.view.Rect") + ".visible"), true);
      await set("开关默认值", "false");
      await select("Demo.view.Rect");
      await press('[data-interaction-property="visible"]', "解除");
      assert.ok(
        !(await evaluate(
          '!!document.querySelector("[data-interaction-property=visible]")',
        )),
      );
      await click("#undoBtn");
      assert.ok(
        await evaluate(
          '!!document.querySelector("[data-interaction-property=visible]")',
        ),
      );
      await click("#themeBtn");
      await shot("inspector-click-binding-dark");
      const beforeDelete = await evaluate("window.vinaEditor.source");
      await select("Demo.view");
      await press("#inspBody", "删除组件");
      assert.equal(
        await evaluate(
          'window.vinaEditor.project.doc.roots.some(n=>n.name==="Demo")',
        ),
        false,
      );
      assert.equal(await evaluate(frame("Observer.view") + ".w"), 110);
      assert.equal(await evaluate(frame("Observer.view") + ".visible"), true);
      assert.equal(
        await evaluate(frame("Observer.view") + ".p.label"),
        "literal ${Demo.view.Button.width}",
      );
      assert.equal(
        await evaluate("window.vinaEditor.project.behaviorGraph"),
        undefined,
      );
      await click("#undoBtn");
      assert.equal(await evaluate("window.vinaEditor.source"), beforeDelete);
      await click("#redoBtn");
      assert.equal(
        await evaluate(
          'window.vinaEditor.project.doc.roots.some(n=>n.name==="Demo")',
        ),
        false,
      );
      assert.deepEqual(errors, []);
    }),
);
