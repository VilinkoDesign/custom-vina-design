import { test } from "node:test";
import assert from "node:assert/strict";
import { browserSession } from "./browser-harness.mjs";

const options = {
  skip: !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable",
  timeout: 60000,
};
const pathSource =
  'Demo { view { type: "path", x: 40, y: 40, width: 220, height: 180, points: "5,5 95,5 50,95", pathWidth: 100, pathHeight: 100, border: 3, borderOnly: true, borderColor: rgb(255,80,40), closed: false } }';

async function navigate(session, source = pathSource) {
  await session.call("Page.navigate", {
    url: session.origin + "/index.html#c=" + Buffer.from(source).toString("base64url"),
  });
  await session.waitFor('document.documentElement?.dataset.ready === "true"');
}

test("path editing adds points on double click, drags them and removes them", options, async () =>
  browserSession(async (session) => {
    const { call, evaluate, waitFor, mouse, errors } = session;
    await navigate(session);
    const path = await evaluate(`(() => {const n=document.querySelector('#scene .el[data-type="path"]'),r=n.getBoundingClientRect();return {x:r.x+r.width*.52,y:r.y+r.height*.12}})()`);
    await mouse("mouseMoved", path);
    await mouse("mousePressed", path, { clickCount: 1 });
    await mouse("mouseReleased", path, { clickCount: 1 });
    await mouse("mousePressed", path, { clickCount: 2 });
    await mouse("mouseReleased", path, { clickCount: 2 });
    await waitFor('document.querySelectorAll(".path-point").length === 4');
    assert.equal(await evaluate('window.vinaEditor.source.match(/points: "([^"]+)"/)[1].trim().split(/\\s+/).length'), 4);
    const dot = await evaluate(`(() => {const n=document.querySelector('.path-point[data-point="1"]'),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await mouse("mouseMoved", dot);
    await mouse("mousePressed", dot, { clickCount: 1 });
    await mouse("mouseMoved", { x: dot.x + 24, y: dot.y + 15 }, { buttons: 1, button: "left", clickCount: 1 });
    await mouse("mouseReleased", { x: dot.x + 24, y: dot.y + 15 }, { clickCount: 1 });
    assert.notEqual(await evaluate('window.vinaEditor.source.match(/points: "([^"]+)"/)[1]'), "5,5 52,5 95,5 50,95");
    await mouse("mousePressed", { x: dot.x + 24, y: dot.y + 15 }, { clickCount: 1 });
    await mouse("mouseReleased", { x: dot.x + 24, y: dot.y + 15 }, { clickCount: 1 });
    await mouse("mousePressed", { x: dot.x + 24, y: dot.y + 15 }, { clickCount: 2 });
    await mouse("mouseReleased", { x: dot.x + 24, y: dot.y + 15 }, { clickCount: 2 });
    await waitFor('document.querySelectorAll(".path-point").length === 3');
    assert.deepEqual(errors, []);
  }));

test("file menu keeps five recent projects with compact hints and restores one", options, async () =>
  browserSession(async (session) => {
    const { click, evaluate, waitFor, errors, call, origin } = session;
    await navigate(session, 'Demo { view { type: "rect", width: 80, height: 40 } }');
    for (let i = 1; i <= 7; i++) {
      await click("#newBtn");
      await evaluate(`(() => {const n=document.querySelector('[aria-label="工程名称"]');n.value='工程${i}';return n.value})()`);
      await click("#editDialog .modal-foot .btn-primary");
      await waitFor('!document.querySelector("#editDialog").open');
      await waitFor(`window.vinaEditor.project.name === "工程${i}"`);
    }
    await click("#fileMenuBtn");
    assert.equal(await evaluate('document.querySelectorAll("#recentProjects [data-recent-index]").length'), 5);
    assert.equal(await evaluate('document.querySelector("#recentProjects").scrollHeight > document.querySelector("#recentProjects").clientHeight'), true);
    assert.equal(await evaluate('document.querySelector("#recentProjects [data-recent-index=\\"0\\"] strong").textContent'), "工程7");
    assert.match(await evaluate('document.querySelector("#recentProjects [data-recent-index=\\"0\\"] small").textContent'), /360 × 480/);
    await evaluate('document.querySelector("#recentProjects [data-recent-index=\\"4\\"]").scrollIntoView({ block: "nearest" })');
    await click('#recentProjects [data-recent-index="4"]');
    await waitFor('window.vinaEditor.project.name === "工程3"');
    assert.equal(await evaluate('document.querySelector("#fileMenu").hidden'), true);
    await call("Page.navigate", { url: origin + "/index.html" });
    await waitFor('document.documentElement?.dataset.ready === "true"');
    assert.equal(await evaluate('window.vinaEditor.project.name'), "工程3");
    await click("#fileMenuBtn");
    assert.equal(await evaluate('document.querySelector("#recentProjects [data-recent-index=\\"0\\"] strong").textContent'), "工程3");
    assert.deepEqual(errors, []);
  }));

test("ctrl-wheel zoom stays anchored, while ordinary wheel scrolling remains available", options, async () =>
  browserSession(async (session) => {
    const { call, click, evaluate, waitFor, errors } = session;
    await navigate(
      session,
      'Rect { view { type: "rect", x: 20, y: 20, width: 120, height: 80, background: rgb(30,120,220) } } Path { view { type: "path", x: 190, y: 20, width: 140, height: 120, points: "5,5 95,5 50,95", pathWidth: 100, pathHeight: 100, border: 3, borderOnly: true, borderColor: rgb(255,80,40), closed: false } }',
    );
    await click('#scene .el[data-type="path"]');
    await waitFor('document.querySelectorAll(".path-point").length === 3');
    const before = await evaluate(`(() => {const p=document.querySelector('.path-point'),r=p.getBoundingClientRect();const h=document.querySelector('.resize-handle');return {point:{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width},handle:h?.getBoundingClientRect().width||0}})()`);
    await click('#scene .el[data-type="rect"]');
    const rectBefore = await evaluate('document.querySelector(".resize-handle[data-corner=\\"se\\"]").getBoundingClientRect().width');
    await click('#scene .el[data-type="path"]');
    await waitFor('document.querySelectorAll(".path-point").length === 3');
    await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.point.x, y: before.point.y, deltaX: 0, deltaY: -240 });
    assert.equal(await evaluate('document.querySelector("#zoomSelect").value'), "1");
    await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.point.x, y: before.point.y, deltaX: 0, deltaY: -240, modifiers: 2 });
    await waitFor('Number(document.querySelector("#zoomSelect").value) > 1');
    const after = await evaluate(`(() => {const p=document.querySelector('.path-point'),r=p.getBoundingClientRect();return {point:{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width}}})()`);
    assert.ok(Math.hypot(after.point.x - before.point.x, after.point.y - before.point.y) < 2, JSON.stringify({ before, after }));
    assert.ok(Math.abs(after.point.w - before.point.w) < 1, JSON.stringify({ before, after }));
    await evaluate('document.querySelector("#zoomSelect").value="4";document.querySelector("#zoomSelect").dispatchEvent(new Event("change",{bubbles:true}))');
    await waitFor('document.querySelector("#zoomSelect").value === "4"');
    const maxZoomPoint = await evaluate('document.querySelector(".path-point").getBoundingClientRect().width');
    assert.ok(Math.abs(maxZoomPoint - before.point.w) < 1, `${before.point.w} -> ${maxZoomPoint}`);
    await click('#scene .el[data-type="rect"]');
    const rectAfter = await evaluate('document.querySelector(".resize-handle[data-corner=\\"se\\"]").getBoundingClientRect().width');
    assert.ok(Math.abs(rectAfter - rectBefore) < 1, `${rectBefore} -> ${rectAfter}`);
    assert.deepEqual(errors, []);
  }));

test("the bundled StudioCard example uses the EXAMPLE eyebrow and FA6 arrow glyphs", options, async () =>
  browserSession(async (session) => {
    const { click, evaluate, waitFor, errors } = session;
    await navigate(session, 'Preset { dependsOn: "Pogget_Std" }');
    await click("#boardEmpty button");
    await waitFor('window.vinaEditor.source.includes("E X A M P L E")');
    assert.equal(await evaluate('window.vinaEditor.source.includes("S T U D I O")'), false);
    assert.equal(await evaluate('[...document.querySelectorAll(".vina-fa-glyph")].some(n=>n.textContent.codePointAt(0)===0xf35d)'), true);
    await click("#runBtn");
    await click('#scene .el[data-type="button"]');
    await waitFor('[...document.querySelectorAll(".vina-fa-glyph")].some(n=>n.textContent.codePointAt(0)===0xf062)');
    assert.equal(await evaluate('[...document.querySelectorAll(".vina-fa-glyph")].some(n=>n.textContent.codePointAt(0)===0xf062)'), true);
    assert.deepEqual(errors, []);
  }));
