import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
};
export function createServer(basePath = "/") {
  return http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith(basePath)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const relative = pathname.slice(basePath.length) || "index.html";
      if (
        !/^(?:index\.html|config\.js|LICENSE|NOTICE|[A-Z_]+\.md|src\/[a-z0-9-]+\.js|assets\/[a-z-]+\.(?:svg|css)|licenses\/[A-Z_]+\.(?:txt|md))$/u.test(
          relative,
        )
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const file = path.resolve(root, relative);
      if (!file.startsWith(root)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const content = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] ?? "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createServer(process.env.BASE_PATH ?? "/");
  server.listen(Number(process.env.PORT ?? 47135), "127.0.0.1", () =>
    console.log(
      `Voice Checkout: http://127.0.0.1:${server.address().port}${process.env.BASE_PATH ?? "/"}`,
    ),
  );
}
