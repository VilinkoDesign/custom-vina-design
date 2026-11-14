import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { browserSession } from "./browser-harness.mjs";
import { personalizationSource as source } from "./fixtures/personalization.mjs";

test("native personalization: wrapped disclosures, internal labels, all controls, live visibility, HSL capture, search restoration and themes", {
  skip: !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable", timeout: 60000,
}, async () => browserSession(async ({ call, evaluate, waitFor, click, mouse, origin, errors }) => {
  await call("Page.navigate", { url: origin + "/index.html#c=" + Buffer.from(source).toString("base64url") });
  await waitFor('document.documentElement.dataset.ready === "true"');
  await click("#runBtn");
  assert.equal(await evaluate('document.querySelectorAll(".personal-group").length'), 5);
  assert.equal(await evaluate('[...document.querySelectorAll(".personal-group")].every(n=>!n.open)'), true);
  assert.deepEqual(await evaluate('document.querySelector(".personalization-panel").textContent.match(/pogget\\.label\\.\\w+/g)||[]'), []);
  const group = '[data-group="Custom"]';
  await click(group + " > summary");
  await waitFor(`document.querySelector('${group}').open`);
  const geometry = await evaluate(`(() => {const n=document.querySelector('${group}'),h=n.querySelector('summary').getBoundingClientRect(),t=n.querySelector('.personal-group-description').getBoundingClientRect(),b=n.querySelector('.personal-group-body').getBoundingClientRect();return {header:h.height,inside:t.bottom<=h.bottom,body:b.top>=h.bottom-1,overflow:n.scrollWidth>n.clientWidth+1}})()`);
  assert.ok(geometry.header > 100, JSON.stringify(geometry));
  assert.equal(geometry.inside, true); assert.equal(geometry.body, true); assert.equal(geometry.overflow, false);
  const set = async (label, value, event = "change") => evaluate(`(() => {const n=document.querySelector('[aria-label="${label}"]');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('${event}',{bubbles:true}));})()`);
  await set("Custom.ui.Width.value", "75", "input");
  assert.equal(await evaluate('window.vinaEditor.preview.frames.find(f=>f.path==="Custom.view").w'), 216);
  await evaluate(`document.querySelector('[aria-label="Custom.ui.Enabled.value"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-variable="Custom.ui.Color.value"]').hidden`), true);
  await evaluate(`document.querySelector('[aria-label="Custom.ui.Enabled.value"]').click()`);
  await set("Custom.ui.Mode.value", "0");
  assert.equal(await evaluate('window.vinaEditor.preview.inputs["Custom.ui.Mode.value"]'), true);
  await set("Custom.ui.Text.value", "改后的中文 😀");
  assert.equal(await evaluate('window.vinaEditor.preview.inputs["Custom.ui.Text.value"]'), "改后的中文 😀");
  await evaluate(`document.querySelector('[aria-label="Custom.ui.Font.value"]').scrollIntoView({block:'center'})`);
  await click('[aria-label="Custom.ui.Font.value"]');
  await set("字体名称", "Consolas");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  await waitFor('!document.querySelector(".personal-font-dialog")');
  assert.equal(await evaluate('window.vinaEditor.preview.inputs["Custom.ui.Font.value"]'), "Consolas");
  assert.equal(await evaluate('document.querySelector("#runBtn").textContent'), "停止");
  // Actual mouse drags, including an out-of-bounds segment, must keep the same rail node alive.
  for (const axis of ["H", "S", "L"]) {
    const selector = `[aria-label="Custom.ui.Color.value.${axis}"]`;
    await evaluate('Promise.all(document.querySelector(".personalization-panel").getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))');
    await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center'})`);
    const p = await evaluate(`(() => {const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width*.35,y:r.y+r.height/2,w:r.width}})()`);
    await mouse("mouseMoved", p); await mouse("mousePressed", p);
    await mouse("mouseMoved", { x: p.x + p.w * .35, y: p.y }, { buttons: 1, button: "left" });
    await mouse("mouseMoved", { x: p.x + p.w * .30, y: p.y + 20 }, { buttons: 1, button: "left" });
    await mouse("mouseReleased", { x: p.x + p.w * .30, y: p.y + 20 });
    const railValue = await evaluate(`Number(document.querySelector('${selector}').value)`);
    assert.ok(railValue > (axis === "H" ? 180 : 50), axis + ": " + railValue + " / " + JSON.stringify(p));
    const color = await evaluate('window.vinaEditor.preview.inputs["Custom.ui.Color.value"]');
    assert.ok(color > 255, axis + " must not clamp to one");
    assert.equal(await evaluate('window.vinaEditor.preview.frames.find(f=>f.path==="Custom.view").p.background'), color);
  }
  const search = '[aria-label="搜索个性化设置"]';
  await evaluate(`document.querySelector('${search}').value='H、S、L';document.querySelector('${search}').dispatchEvent(new Event('input'))`);
  assert.equal(await evaluate(`document.querySelector('[data-variable="Custom.ui.Color.value"]').hidden`), false);
  assert.equal(await evaluate(`document.querySelector('[data-variable="Custom.ui.Width.value"]').hidden`), true);
  await evaluate(`document.querySelector('${search}').value='';document.querySelector('${search}').dispatchEvent(new Event('input'))`);
  assert.equal(await evaluate(`document.querySelector('${group}').open`), true);
  await evaluate('document.querySelector("#inspBody").scrollTop=0');
  await click('[data-group="Background"] > summary');
  await set("Background.ui.RenderStyle.value", "4");
  assert.equal(await evaluate('window.vinaEditor.preview.inputs["pogget.mode"]'), 4);
  assert.equal(await evaluate(`document.querySelector('[data-variable="Background.ui.ShadowBlur.value"]').hidden`), false);
  await evaluate(`document.querySelector('[aria-label="Custom.ui.Action.value"]').click()`);
  assert.equal(await evaluate('window.vinaEditor.preview.inputs["pogget.isListView"]'), true);
  const capture = async name => {
    await evaluate('Promise.all(document.querySelector(".personalization-panel").getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))');
    await mkdir("test-results/personalization", { recursive: true });
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile("test-results/personalization/" + name + ".png", Buffer.from(shot.data, "base64"));
  };
  await capture("light");
  await click("#themeBtn");
  assert.equal(await evaluate(`document.querySelector('${group}').open`), true);
  await evaluate(`document.querySelector('${group}').scrollIntoView({block:'start'})`);
  await capture("dark");
  assert.equal(await evaluate("window.vinaEditor.source"), source);
  await click("#runBtn");
  assert.equal(await evaluate("window.vinaEditor.source"), source);
  assert.deepEqual(errors, []);
}));
