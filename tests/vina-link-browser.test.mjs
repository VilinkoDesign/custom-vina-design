import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { serve } from "../tools/serve.mjs";

test("browser hash import replaces storage atomically and consumes only valid links", {
  skip: !process.env.CHROME_PATH && "Set CHROME_PATH to a Chromium executable",
  timeout: 45000,
}, async () => {
  const profile = await mkdtemp(join(tmpdir(), "vina-link-browser-"));
  const server = serve(0);
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = spawn(process.env.CHROME_PATH, [
    "--headless=new", "--remote-debugging-port=0", "--no-first-run",
    `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Chromium startup timeout")), 10000);
      browser.once("error", reject);
      browser.stderr.on("data", (chunk) => {
        output += chunk;
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const pages = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    socket = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
    await once(socket, "open");
    let serial = 0;
    const callbacks = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data), callback = callbacks.get(message.id);
      if (!callback) return;
      callbacks.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      callbacks.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async (expression) => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Browser condition timed out: " + expression);
    };
    const key = "customvina.project.v2";
    const first = '// original\r\nA {\r\n\tview { width: 120, height: 40 }\r\n}\r\n';
    const second = '// 第二个 😀\nB { view { width: 80, height: 30 } }\n';
    const hash = (s) => "#c=" + Buffer.from(s).toString("base64url");
    await call("Page.enable");
    // Exercise initial navigation (rather than only the hashchange handler).
    await call("Page.navigate", { url: origin + "/index.html" + hash(first) });
    await waitFor('document.documentElement.dataset.ready === "true"');
    assert.equal(await evaluate("window.vinaEditor.source"), first);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).linkedSource.source`), first);
    assert.equal(await evaluate("location.hash"), "");
    await call("Page.reload");
    await waitFor('document.documentElement.dataset.ready === "true"');
    assert.equal(await evaluate("window.vinaEditor.source"), first);

    await evaluate('document.getElementById("runBtn").click()');
    assert.equal(await evaluate('document.getElementById("runBtn").classList.contains("is-running")'), true);
    await evaluate(`location.hash = ${JSON.stringify(hash(second))}`);
    await waitFor(`window.vinaEditor.source === ${JSON.stringify(second)}`);
    assert.equal(await evaluate('document.getElementById("runBtn").classList.contains("is-running")'), false);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).linkedSource.source`), second);
    assert.equal(await evaluate("window.vinaEditor.history.undo"), false);
    const prior = await evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
    await evaluate('location.hash = "#c=_w"');
    await waitFor('[...document.querySelectorAll(".toast")].some(n => n.textContent.includes("链接导入失败"))');
    assert.equal(await evaluate("window.vinaEditor.source"), second);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`), prior);
    await evaluate(`window.testSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === ${JSON.stringify(key)}) throw new DOMException("quota", "QuotaExceededError");
        return window.testSetItem.call(this, key, value);
      };
      location.hash = ${JSON.stringify(hash(first))};`);
    await waitFor('[...document.querySelectorAll(".toast")].some(n => n.textContent.includes("quota"))');
    assert.equal(await evaluate("window.vinaEditor.source"), second);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`), prior);
    assert.notEqual(await evaluate("location.hash"), "");
    await evaluate("Storage.prototype.setItem = window.testSetItem");
    assert.match(await evaluate('document.querySelector(".version-row").textContent'), /0\.2\.1/);
    assert.match(await evaluate('document.querySelectorAll(".version-row")[1].textContent'), /Beta6/);
  } finally {
    socket?.close();
    browser.kill();
    await once(browser, "exit").catch(() => {});
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
