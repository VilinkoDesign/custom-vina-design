import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserSession } from "./browser-harness.mjs";

const options = {
  skip: !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable",
  timeout: 60000,
};
const source =
  'First { view { type: "rect", x: 20, y: 20, width: 80, height: 40 } } Second { view { type: "rect", x: 140, y: 20, width: 80, height: 40 } }';
async function navigate({ call, waitFor, origin }) {
  await call("Page.navigate", {
    url: origin + "/index.html#c=" + Buffer.from(source).toString("base64url"),
  });
  await waitFor('document.documentElement?.dataset.ready==="true"');
}
async function key(call, key, extra = {}) {
  await call("Input.dispatchKeyEvent", { type: "keyDown", key, ...extra });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key, ...extra });
}
async function screenshot({ call, waitFor }, name) {
  if (!process.env.VINA_SCREENSHOT_DIR) return;
  await waitFor(
    '[...document.querySelectorAll(".tool-menu:not([hidden])")].every(n=>!n.getAnimations().some(a=>a.playState==="running"))',
  );
  await mkdir(process.env.VINA_SCREENSHOT_DIR, { recursive: true });
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(process.env.VINA_SCREENSHOT_DIR, name + ".png"),
    Buffer.from(shot.data, "base64"),
  );
}

test(
  "file menu owns the moved actions; real new/import/export, dismissal and keyboard navigation work",
  options,
  async () =>
    browserSession(async (session) => {
      const { evaluate, click, call, mouse, waitFor, errors } = session;
      await navigate(session);
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#toolMenus > [aria-haspopup=menu]")].map(n=>n.textContent.trim())',
        ),
        ["文件", "编辑", "关于"],
      );
      assert.equal(
        await evaluate(
          'document.querySelectorAll(".topbar-actions #newBtn,.topbar-actions #importBtn,.topbar-actions #undoBtn,.topbar-actions #redoBtn,.brand-badge").length',
        ),
        0,
      );
      await click("#fileMenuBtn");
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#fileMenu .tool-menu-label")].map(n=>n.textContent)',
        ),
        ["新建", "导入", "导出"],
      );
      assert.equal(await evaluate("document.activeElement.id"), "newBtn");
      await key(call, "ArrowDown");
      assert.equal(await evaluate("document.activeElement.id"), "importBtn");
      await key(call, "End");
      assert.equal(await evaluate("document.activeElement.id"), "menuExport");
      await key(call, "Home");
      assert.equal(await evaluate("document.activeElement.id"), "newBtn");
      await key(call, "Escape");
      assert.equal(
        await evaluate('document.querySelector("#fileMenu").hidden'),
        true,
      );
      assert.equal(await evaluate("document.activeElement.id"), "fileMenuBtn");
      await key(call, "ArrowRight");
      assert.equal(await evaluate("document.activeElement.id"), "editMenuBtn");
      await key(call, "ArrowDown");
      assert.equal(await evaluate("document.activeElement.id"), "editMenu"); // All edit commands are unavailable initially.
      await key(call, "ArrowRight");
      assert.equal(
        await evaluate("document.activeElement.id"),
        "aboutMenuItem",
      );
      assert.equal(
        await evaluate('document.querySelector("#editMenu").hidden'),
        true,
      );
      await key(call, "Escape");
      await click("#fileMenuBtn");
      await key(call, "Tab");
      assert.equal(
        await evaluate('document.querySelector("#fileMenu").hidden'),
        true,
      );
      assert.equal(await evaluate("document.activeElement.id"), "behaviorBtn");
      await key(call, "F10");
      assert.equal(await evaluate("document.activeElement.id"), "fileMenuBtn");
      await key(call, "ArrowDown");
      const editPosition = await evaluate(
        '(() => {const r=document.querySelector("#editMenuBtn").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',
      );
      await mouse("mouseMoved", editPosition);
      assert.equal(
        await evaluate(
          'document.querySelector("#editMenuBtn").getAttribute("aria-expanded")',
        ),
        "true",
      );
      await click("#board");
      assert.equal(
        await evaluate(
          'document.querySelectorAll(".tool-menu:not([hidden])").length',
        ),
        0,
      );
      await click("#fileMenuBtn");
      await screenshot(session, "tool-file-menu-light");
      await click("#newBtn");
      assert.equal(
        await evaluate('document.querySelector("#dialogTitle").textContent'),
        "新建工程",
      );
      assert.equal(
        await evaluate('document.querySelector("#fileMenu").hidden'),
        true,
      );
      await click("#dialogClose");
      await waitFor('!document.querySelector("#editDialog").open');
      assert.equal(await evaluate("document.activeElement.id"), "fileMenuBtn");
      await click("#fileMenuBtn");
      await click("#menuExport");
      assert.equal(
        await evaluate('document.querySelector("#dialogTitle").textContent'),
        "导出预设",
      );
      await click("#dialogClose");
      await waitFor('!document.querySelector("#editDialog").open');
      await click("#exportBtn");
      assert.equal(
        await evaluate('document.querySelector("#dialogTitle").textContent'),
        "导出预设",
      );
      await click("#dialogClose");
      await waitFor('!document.querySelector("#editDialog").open');
      assert.equal(await evaluate("document.activeElement.id"), "exportBtn");
      await call("Page.setInterceptFileChooserDialog", { enabled: true });
      await evaluate(
        'window.__pickerClicks=0;document.querySelector("#fileInput").addEventListener("click",()=>window.__pickerClicks++)',
      );
      await click("#fileMenuBtn");
      await click("#importBtn");
      assert.equal(await evaluate("window.__pickerClicks"), 1);
      const documentNode = await call("DOM.getDocument");
      const input = await call("DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector: "#fileInput",
      });
      await call("DOM.setFileInputFiles", {
        nodeId: input.nodeId,
        files: [
          fileURLToPath(
            new URL("../examples/BehaviorDisclosure.vina", import.meta.url),
          ),
        ],
      });
      await waitFor('window.vinaEditor.source.includes("Disclosure {")');
      assert.equal(
        await evaluate('document.querySelector("#fileMenu").hidden'),
        true,
      );
      assert.deepEqual(errors, []);
    }),
);

test(
  "edit menu has real undo/redo icons and commands; grouping, shortcuts and disabled preview states stay consistent",
  options,
  async () =>
    browserSession(async (session) => {
      const { evaluate, click, call, waitFor, errors } = session;
      await navigate(session);
      await click("#editMenuBtn");
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#editMenu .tool-menu-label")].map(n=>n.textContent)',
        ),
        ["撤销", "重做", "编组", "解除编组"],
      );
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#undoBtn use,#redoBtn use")].map(n=>n.getAttribute("href"))',
        ),
        [
          "vendor/fontawesome/fa6.svg#fa-rotate-left",
          "vendor/fontawesome/fa6.svg#fa-rotate-right",
        ],
      );
      const sprite = await evaluate(
        'fetch("vendor/fontawesome/fa6.svg").then(r=>r.text())',
      );
      assert.ok(
        sprite.includes('id="fa-rotate-left"') &&
          sprite.includes('id="fa-rotate-right"'),
      );
      assert.equal(
        await evaluate(
          'document.querySelector("#undoBtn").disabled && document.querySelector("#menuGroup").disabled',
        ),
        true,
      );
      await key(call, "Escape");
      await evaluate('document.querySelector("#canvasWrap").focus()');
      await key(call, "a", { code: "KeyA", modifiers: 2 });
      await click("#editMenuBtn");
      assert.equal(
        await evaluate('document.querySelector("#menuGroup").disabled'),
        false,
      );
      assert.equal(
        await evaluate('document.querySelector("#menuUngroup").disabled'),
        true,
      );
      await click("#menuGroup");
      assert.equal(
        await evaluate(
          'window.vinaEditor.preview.frames.filter(f=>f.p.type==="group").length',
        ),
        1,
      );
      assert.equal(
        await evaluate('document.querySelector("#editMenu").hidden'),
        true,
      );
      await click("#editMenuBtn");
      await screenshot(session, "tool-edit-menu-light");
      await click("#undoBtn");
      assert.equal(
        await evaluate(
          'window.vinaEditor.preview.frames.filter(f=>f.p.type==="group").length',
        ),
        0,
      );
      await click("#editMenuBtn");
      await click("#redoBtn");
      assert.equal(
        await evaluate(
          'window.vinaEditor.preview.frames.filter(f=>f.p.type==="group").length',
        ),
        1,
      );
      await click('.layer-row[data-path="Group1.view"] .layer-name');
      await click("#editMenuBtn");
      assert.equal(
        await evaluate('document.querySelector("#menuUngroup").disabled'),
        false,
      );
      await click("#menuUngroup");
      assert.equal(
        await evaluate(
          'window.vinaEditor.preview.frames.filter(f=>f.p.type==="group").length',
        ),
        0,
      );
      await click("#themeBtn");
      await click("#editMenuBtn");
      await screenshot(session, "tool-edit-menu-dark");
      // A shortcut from the open menu closes it and still reaches the editor.
      await key(call, "z", { code: "KeyZ", modifiers: 2 });
      assert.equal(
        await evaluate('document.querySelector("#editMenu").hidden'),
        true,
      );
      assert.equal(
        await evaluate(
          'window.vinaEditor.preview.frames.filter(f=>f.p.type==="group").length',
        ),
        1,
      );
      await click("#runBtn");
      await click("#editMenuBtn");
      assert.equal(
        await evaluate(
          '[...document.querySelectorAll("#editMenu button")].every(n=>n.disabled)',
        ),
        true,
      );
      await key(call, "Escape");
      assert.equal(
        await evaluate('document.querySelector("#runBtn").textContent'),
        "停止",
      );
      await click("#fileMenuBtn");
      assert.equal(
        await evaluate(
          'document.querySelector("#newBtn").disabled && document.querySelector("#importBtn").disabled',
        ),
        true,
      );
      await key(call, "Escape");
      await click("#runBtn");
      for (const width of [820, 550, 390]) {
        await call("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await click("#fileMenuBtn");
        await waitFor(
          '!document.querySelector("#fileMenu").getAnimations().some(a=>a.playState==="running")',
        );
        assert.ok(
          await evaluate(
            '(() => {const r=document.querySelector("#fileMenu").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()',
          ),
        );
        assert.ok(
          await evaluate(
            '[...document.querySelectorAll(".tool-menu-trigger,.topbar-actions button")].every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})',
          ),
        );
        assert.ok(
          await evaluate(
            '(() => {const header=document.querySelector(".topbar").getBoundingClientRect();return document.querySelector(".workspace").getBoundingClientRect().top>=header.bottom && [...document.querySelectorAll(".topbar-actions button")].every(n=>n.getBoundingClientRect().bottom<=header.bottom)})()',
          ),
        );
        if (width === 390) await screenshot(session, "tool-menu-narrow");
        await key(call, "Escape");
      }
      assert.deepEqual(errors, []);
    }),
);

test(
  "about menu contains only About and opens a themed standalone page without changing the saved project",
  options,
  async () =>
    browserSession(async (session) => {
      const { evaluate, click, call, waitFor, origin, errors } = session;
      await navigate(session);
      const saved = await evaluate(
        'localStorage.getItem("customvina.project.v2")',
      );
      await click("#themeBtn");
      await click("#aboutMenuBtn");
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#aboutMenu [role=menuitem]")].map(n=>n.textContent.trim())',
        ),
        ["关于..."],
      );
      await click("#aboutMenuItem");
      let aboutTarget;
      for (let i = 0; i < 80; i++) {
        aboutTarget = (await call("Target.getTargets")).targetInfos.find(
          (target) => target.url === origin + "/about.html",
        );
        if (aboutTarget) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(aboutTarget);
      assert.equal(
        await evaluate('document.querySelector("#aboutMenu").hidden'),
        true,
      );
      assert.equal(
        await evaluate('localStorage.getItem("customvina.project.v2")'),
        saved,
      );
      await call("Target.closeTarget", { targetId: aboutTarget.targetId });
      await call("Page.navigate", { url: origin + "/about.html" });
      await waitFor(
        'document.body?.classList.contains("about-page") && document.documentElement?.dataset.ready==="true"',
      );
      assert.equal(await evaluate("document.title"), "关于 CustomVinaEditor");
      assert.equal(
        await evaluate('document.querySelector("h1").textContent'),
        "CustomVinaEditor",
      );
      assert.equal(
        await evaluate("document.documentElement.dataset.theme"),
        "dark",
      );
      await screenshot(session, "about-dark");
      await evaluate(
        'localStorage.setItem("customvina.theme","light");window.dispatchEvent(new StorageEvent("storage",{key:"customvina.theme"}))',
      );
      assert.equal(
        await evaluate("document.documentElement.dataset.theme"),
        "light",
      );
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: false,
      });
      assert.ok(
        await evaluate(
          'document.querySelector(".about-shell").getBoundingClientRect().right<=innerWidth',
        ),
      );
      await screenshot(session, "about-light-narrow");
      assert.equal(
        await evaluate('localStorage.getItem("customvina.project.v2")'),
        saved,
      );
      assert.deepEqual(errors, []);
    }),
);
