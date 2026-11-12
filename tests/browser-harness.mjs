import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { serve } from "../tools/serve.mjs";

export async function browserSession(run) {
  const profile = await mkdtemp(join(tmpdir(), "vina-behavior-browser-"));
  const server = serve(0);
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = spawn(
    process.env.CHROME_PATH,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--no-first-run",
      "--disable-gpu",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error("Chromium startup timeout")),
        10000,
      );
      browser.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      browser.stderr.on("data", (chunk) => {
        output += chunk;
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
    });
    const pages = await (
      await fetch(`http://${new URL(endpoint).host}/json/list`)
    ).json();
    socket = new WebSocket(
      pages.find((p) => p.type === "page").webSocketDebuggerUrl,
    );
    await once(socket, "open");
    let serial = 0;
    const callbacks = new Map(),
      errors = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown")
        errors.push(message.params.exceptionDetails);
      const callback = callbacks.get(message.id);
      if (!callback) return;
      callbacks.delete(message.id);
      clearTimeout(callback.timer);
      if (message.error)
        callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    });
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++serial,
          timer = setTimeout(() => {
            callbacks.delete(id);
            reject(new Error("CDP timeout: " + method));
          }, 15000);
        callbacks.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const r = await call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails)
        throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const waitFor = async (expression) => {
      for (let i = 0; i < 160; i++) {
        if (await evaluate(expression)) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("Browser condition timed out: " + expression);
    };
    const click = async (selector) => {
      const p = await evaluate(
        `(() => {const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();if(!r) throw Error('Missing click target');return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
      );
      await mouse("mouseMoved", p);
      await mouse("mousePressed", p);
      await mouse("mouseReleased", p);
    };
    const mouse = (type, p, extra = {}) =>
      call("Input.dispatchMouseEvent", {
        type,
        x: p.x,
        y: p.y,
        ...(type === "mouseMoved" ? {} : { button: "left", clickCount: 1 }),
        ...extra,
      });
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await run({ call, evaluate, waitFor, click, mouse, origin, errors });
  } finally {
    socket?.close();
    const exited = once(browser, "exit");
    browser.kill();
    await exited.catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}
