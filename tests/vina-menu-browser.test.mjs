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
  "About reuses the original version modal and content in place, with its original motion and dismissal controls",
  options,
  async () =>
    browserSession(async (session) => {
      const { evaluate, click, call, waitFor, mouse, origin, errors } = session;
      await navigate(session);
      const saved = await evaluate(
        'localStorage.getItem("customvina.project.v2")',
      );
      const url = await evaluate("location.href");
      const pages = () =>
        call("Target.getTargets").then(({ targetInfos }) =>
          targetInfos
            .filter((t) => t.type === "page" && t.url.startsWith(origin))
            .map((t) => t.targetId)
            .sort(),
        );
      const originalPages = await pages();
      const settled = () =>
        waitFor(
          '(() => {const mask=document.querySelector("#versionMask");return getComputedStyle(mask).opacity===(mask.classList.contains("show")?"1":"0") && !mask.getAnimations({subtree:true}).some(a=>a.playState==="running")})()',
        );
      const open = async () => {
        await click("#aboutMenuItem");
        await waitFor(
          'document.querySelector("#versionMask").classList.contains("show")',
        );
        await settled();
      };
      await click("#themeBtn");
      await click("#aboutMenuBtn");
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#aboutMenu [role=menuitem]")].map(n=>n.textContent.trim())',
        ),
        ["关于..."],
      );
      await open();
      assert.equal(await evaluate("location.href"), url);
      assert.deepEqual(await pages(), originalPages);
      assert.equal(
        await evaluate('document.querySelector("#aboutMenu").hidden'),
        true,
      );
      assert.equal(
        await evaluate(
          'document.querySelector("#versionMask").getAttribute("aria-hidden")',
        ),
        "false",
      );
      assert.equal(
        await evaluate('document.querySelector("#versionTitle").textContent'),
        "版本信息",
      );
      assert.equal(
        await evaluate('document.querySelector(".version-brand").textContent'),
        "CustomVinaEditor",
      );
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#versionMask .version-row")].map(n=>[n.querySelector("dt").textContent,n.querySelector("dd").textContent])',
        ),
        [
          ["工具版本", "Beta 0.2.1"],
          ["构建号", "build20261111_rel0_Beta6"],
          ["更新时间", "2026-11-11"],
        ],
      );
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector("#versionMask")).transitionDuration',
        ),
        "0.18s, 0.18s",
      );
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector(".modal-version")).transitionDuration',
        ),
        "0.18s",
      );
      await screenshot(session, "about-original-modal-dark");
      assert.equal(await evaluate("document.activeElement.id"), "versionClose");
      await key(call, "Tab", { modifiers: 8 });
      assert.equal(await evaluate("document.activeElement.id"), "versionOk");
      await key(call, "Tab");
      assert.equal(await evaluate("document.activeElement.id"), "versionClose");
      await key(call, "F10");
      assert.equal(await evaluate("document.activeElement.id"), "versionClose");
      await click("#versionClose");
      await settled();
      assert.equal(
        await evaluate(
          'document.querySelector("#versionMask").getAttribute("aria-hidden")',
        ),
        "true",
      );
      assert.equal(await evaluate("document.activeElement.id"), "aboutMenuBtn");
      await click("#themeBtn");
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await open();
      assert.ok(
        await evaluate(
          'document.querySelector(".modal-version").getBoundingClientRect().right<=innerWidth',
        ),
      );
      await screenshot(session, "about-original-modal-light-narrow");
      await click("#versionOk");
      await settled();
      await open();
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
        await mouse(type, { x: 8, y: 8 });
      await settled();
      assert.equal(
        await evaluate(
          'document.querySelector("#versionMask").classList.contains("show")',
        ),
        false,
      );
      await click("#runBtn");
      await open();
      await key(call, "Escape");
      await settled();
      assert.equal(
        await evaluate(
          'document.querySelector("#versionMask").classList.contains("show")',
        ),
        false,
      );
      assert.equal(
        await evaluate('document.querySelector("#runBtn").textContent'),
        "停止",
      );
      assert.equal(
        await evaluate('localStorage.getItem("customvina.project.v2")'),
        saved,
      );
      assert.deepEqual(errors, []);
    }),
);
