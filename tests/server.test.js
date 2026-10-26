import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../scripts/serve.js";
test("Pages subpath serves every application module and rejects private files", async (t) => {
  const server = createServer("/voice-checkout/");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/voice-checkout/`;
  for (const file of [
    "",
    "src/app.js",
    "src/i18n.js",
    "src/semantic-worker.js",
    "config.js",
    "assets/style.css",
  ]) {
    const response = await fetch(url + file);
    assert.equal(response.status, 200, file);
  }
  for (const file of [
    ".git/config",
    ".env",
    "node_modules/piper-plus/src/index.js",
    "%2e%2e/.git/config",
  ])
    assert.equal((await fetch(url + file)).status, 404);
});
