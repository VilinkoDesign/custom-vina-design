import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browserSession } from "./browser-harness.mjs";
import { sortPillSource } from "./fixtures/sort-pill.mjs";

const options = {
  skip: !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable",
  timeout: 60000,
};
const button = (text) =>
  `[...document.querySelectorAll('#behaviorDialog button')].find(n=>n.textContent===${JSON.stringify(text)})`;
test(
  "the user's sort pill opens as a readable overview; drilldown, editing and layout preserve its native behavior",
  options,
  async () =>
    browserSession(
      async ({ call, evaluate, waitFor, click, mouse, origin, errors }) => {
        const shot = async (name) => {
          if (!process.env.VINA_SCREENSHOT_DIR) return;
          await waitFor(
            '![...document.querySelectorAll("dialog[open]")].some(d=>d.getAnimations().some(a=>a.animationName==="vinaDialogIn" && a.playState==="running"))',
          );
          await mkdir(process.env.VINA_SCREENSHOT_DIR, { recursive: true });
          const data = await call("Page.captureScreenshot", { format: "png" });
          await writeFile(
            join(process.env.VINA_SCREENSHOT_DIR, name + ".png"),
            Buffer.from(data.data, "base64"),
          );
        };
        await call("Page.navigate", {
          url:
            origin +
            "/index.html#c=" +
            Buffer.from(sortPillSource).toString("base64url"),
        });
        await waitFor('document.documentElement?.dataset.ready === "true"');
        const original = await evaluate("window.vinaEditor.source");
        await click("#behaviorBtn");
        await waitFor(
          'document.querySelectorAll(".behavior-summary-wire").length>0',
        );
        assert.equal(
          await evaluate(
            'document.querySelectorAll(".behavior-summary").length',
          ),
          16,
        );
        assert.ok(
          await evaluate(
            'parseInt(document.querySelector(".behavior-zoom").textContent)>=75',
          ),
        );
        assert.match(
          await evaluate(
            'document.querySelector(".behavior-count").textContent',
          ),
          /786/,
        );
        const boxes = await evaluate(
          '[...document.querySelectorAll(".behavior-summary")].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}})',
        );
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j];
            assert.ok(
              a.right <= b.left ||
                b.right <= a.left ||
                a.bottom <= b.top ||
                b.bottom <= a.top,
              "Summary cards must not overlap in the browser",
            );
          }
        await shot("sort-pill-overview-light");
        const expand = '[data-behavior-node="logic:SortPill.vars.expand"]';
        await click(expand);
        assert.ok(
          await evaluate(
            'document.querySelectorAll(".behavior-summary-wire.focused").length>0 && document.querySelectorAll(".behavior-summary-wire.muted").length>0',
          ),
        );
        const menu = '[data-behavior-node="region:SortPill.view.TimeMenu"]';
        await click(menu);
        await evaluate(
          'document.querySelector(".behavior-group-properties").open=true',
        );
        await waitFor(
          '[...document.querySelectorAll(".behavior-group-properties button")].some(n=>n.textContent==="TimeMenu.visible")',
        );
        await evaluate(
          '[...document.querySelectorAll(".behavior-group-properties button")].find(n=>n.textContent==="TimeMenu.visible").click()',
        );
        assert.match(
          await evaluate(
            'document.querySelector(".behavior-breadcrumb").textContent',
          ),
          /TimeMenu/,
        );
        assert.equal(
          await evaluate(
            'document.querySelectorAll(".behavior-node[data-type=action]").length',
          ),
          2,
        );
        const field = '#behaviorDialog [aria-label="Vina 表达式"]';
        const code = await evaluate(
          `document.querySelector(${JSON.stringify(field)}).value`,
        );
        assert.ok(code.includes("f32(0.02)"));
        await evaluate(
          `(() => {const n=document.querySelector(${JSON.stringify(field)});n.value=n.value.replace('f32(0.02)','f32(0.03)');n.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
        assert.equal(await evaluate("window.vinaEditor.source"), original);
        await click('[aria-label="撤销节点编辑"]');
        assert.equal(
          await evaluate(
            `document.querySelector(${JSON.stringify(field)}).value`,
          ),
          code,
        );
        await shot("sort-pill-detail");
        await evaluate(`${button("← 交互总览")}.click()`);
        assert.equal(
          await evaluate(
            'document.querySelectorAll(".behavior-summary").length',
          ),
          16,
        );
        await evaluate(
          "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        );
        const position = await evaluate(
          `(() => {const n=document.querySelector(${JSON.stringify(expand)}),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,left:n.style.left}})()`,
        );
        await mouse("mouseMoved", position);
        await mouse("mousePressed", position);
        await mouse(
          "mouseMoved",
          { x: position.x + 25, y: position.y + 15 },
          { buttons: 1 },
        );
        await waitFor(
          `document.querySelector(${JSON.stringify(expand)}).style.left!==${JSON.stringify(position.left)}`,
        );
        await mouse("mouseReleased", {
          x: position.x + 25,
          y: position.y + 15,
        });
        assert.notEqual(
          await evaluate(
            `document.querySelector(${JSON.stringify(expand)}).style.left`,
          ),
          position.left,
        );
        await click('[aria-label="撤销节点编辑"]');
        assert.equal(
          await evaluate(
            `document.querySelector(${JSON.stringify(expand)}).style.left`,
          ),
          position.left,
        );
        await evaluate(`${button("应用行为 *")}.click()`);
        await waitFor('!document.querySelector("#behaviorDialog")');
        assert.equal(await evaluate("window.vinaEditor.source"), original);
        assert.ok(
          await evaluate(
            "window.vinaEditor.project.behaviorGraph.graph.nodes.length>4000",
          ),
        );
        await evaluate("delete document.documentElement.dataset.ready");
        await call("Page.reload");
        await waitFor('document.documentElement?.dataset.ready === "true"');
        await click("#themeBtn");
        await click("#behaviorBtn");
        await click(expand);
        await shot("sort-pill-overview-dark");
        assert.equal(
          await evaluate(
            'document.querySelectorAll(".behavior-summary").length',
          ),
          16,
        );
        assert.equal(await evaluate("window.vinaEditor.source"), original);
        assert.deepEqual(errors, []);
      },
    ),
);

test(
  "native dialogs restore the original 180ms fade/10px motion, animate dismissal and honor reduced motion",
  options,
  async () =>
    browserSession(
      async ({ call, evaluate, waitFor, click, origin, errors }) => {
        await call("Page.navigate", {
          url:
            origin +
            "/index.html#c=" +
            Buffer.from("Card { view { width: 120, height: 40 } }").toString(
              "base64url",
            ),
        });
        await waitFor('document.documentElement?.dataset.ready === "true"');
        const openMotion = async (buttonId, dialogId) =>
          evaluate(
            `(() => {document.getElementById(${JSON.stringify(buttonId)}).click();const d=document.getElementById(${JSON.stringify(dialogId)}), a=d.getAnimations().find(a=>a.animationName==='vinaDialogIn');return {open:d.open,duration:a?.effect.getTiming().duration,frames:a?.effect.getKeyframes().map(k=>({opacity:k.opacity,transform:k.transform}))}})()`,
          );
        const source = await openMotion("sourceBtn", "editDialog");
        assert.equal(source.open, true);
        assert.equal(source.duration, 180);
        assert.equal(source.frames[0].transform, "translateY(10px)");
        assert.equal(source.frames[0].opacity, "0");
        const close = await evaluate(
          '(() => {document.getElementById("dialogClose").click();const d=document.getElementById("editDialog");return {open:d.open,inert:d.inert,closing:d.classList.contains("dialog-closing")}})()',
        );
        assert.deepEqual(close, { open: true, inert: true, closing: true });
        await waitFor('!document.getElementById("editDialog").open');
        const behavior = await openMotion("behaviorBtn", "behaviorDialog");
        assert.equal(behavior.duration, 180);
        await call("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
        });
        await call("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
        });
        await waitFor('!document.querySelector("#behaviorDialog")');
        await call("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-reduced-motion", value: "reduce" },
            { name: "prefers-color-scheme", value: "light" },
          ],
        });
        const reduced = await openMotion("behaviorBtn", "behaviorDialog");
        assert.equal(reduced.duration, undefined);
        const immediate = await evaluate(
          '(() => {document.querySelector("#behaviorDialog [aria-label=关闭行为节点]").click();return document.querySelector("#behaviorDialog").open})()',
        );
        assert.equal(immediate, false);
        await waitFor('!document.querySelector("#behaviorDialog")');
        assert.deepEqual(errors, []);
      },
    ),
);
