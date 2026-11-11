import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export function serve(port = 4173) {
  return http
    .createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        );
        const path = resolve(
          root,
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
        if (
          !path.startsWith(resolve(root) + sep) ||
          /(?:^|[/\\])\./.test(pathname)
        ) {
          res.writeHead(403).end();
          return;
        }
        const content = await readFile(path);
        res.writeHead(200, {
          "Content-Type":
            {
              ".html": "text/html; charset=utf-8",
              ".js": "text/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8",
              ".svg": "image/svg+xml",
              ".ttf": "font/ttf",
              ".json": "application/json; charset=utf-8",
              ".vina": "text/plain; charset=utf-8",
            }[extname(path)] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(content);
      } catch {
        res.writeHead(404).end("Not found");
      }
    })
    .listen(port, "127.0.0.1");
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  serve(Number(process.env.PORT) || 4173).on("listening", () =>
    console.log(
      "CustomVinaEditor: http://127.0.0.1:" + (process.env.PORT || 4173),
    ),
  );
