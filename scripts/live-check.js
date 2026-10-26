// Real CDN/model/SDK smoke test. Never logs in or fakes a PayPal approval.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "./serve.js";
import { checkPayPal } from "./paypal-check.js";

const server = createServer("/voice-checkout/");
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/voice-checkout/`;
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const report = {
  checkedAt: new Date().toISOString(),
  browser: browser.version(),
  checks: {},
  errors: [],
};
await mkdir("artifacts", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(base + "?lang=en");
  await page.locator("#example-order").click();
  await page.screenshot({ path: "artifacts/desktop-en.png", fullPage: true });
  await page.locator("#language").selectOption("ja");
  await page.screenshot({ path: "artifacts/desktop-ja.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile-ja.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator("#language").selectOption("en");
  await page.locator(".enhancements summary").click();
  console.log("Loading real Piper and multilingual AI assets…");
  await page.locator("#enable-ai").click();
  await page.waitForFunction(
    () =>
      /ready|failed/i.test(document.querySelector("#ai-status").textContent) &&
      /ready|device voice/i.test(
        document.querySelector("#voice-status").textContent,
      ),
    null,
    { timeout: 240000 },
  );
  const statuses = await page
    .locator("#ai-status, #voice-status")
    .allTextContents();
  report.checks.enhancements = statuses;
  console.log(JSON.stringify({ enhancements: statuses }));
  assert.match(statuses[0], /AI ready/);
  assert.match(statuses[1], /Piper/);
  await page.locator("#reset").click();
  await page.locator("#order-input").fill("a buttery flaky pastry");
  await page.locator("#order-form button").click();
  await page.waitForFunction(
    () => !document.querySelector("#order-input").disabled,
    null,
    { timeout: 45000 },
  );
  report.checks.semanticReply = await page.locator("#reply").textContent();
  console.log(JSON.stringify({ semanticReply: report.checks.semanticReply }));
  assert.match(report.checks.semanticReply, /one Croissant/);
  await page.locator("#order-input").fill("yes");
  await page.locator("#order-form button").click();
  assert.match(await page.locator("#total").textContent(), /280/);
  await page.locator("#mute").click();
  console.log("Checking real Japanese and English PCM synthesis…");
  report.checks.tts = await page.evaluate(async () => {
    const { SpeechOutput } = await import("./src/speech.js");
    const output = new SpeechOutput();
    await output.enableNeural();
    const results = [];
    for (const [language, text] of [
      ["ja", "コーヒーを二杯。合計七百円です。"],
      ["en", "Two coffees. Your total is seven hundred yen."],
    ]) {
      const audio = await output.synthesize(text, language);
      const sum = audio.samples.reduce((s, x) => s + x * x, 0);
      results.push({
        language,
        sampleRate: audio.sampleRate,
        samples: audio.samples.length,
        seconds: audio.samples.length / audio.sampleRate,
        rms: Math.sqrt(sum / audio.samples.length),
      });
    }
    return results;
  });
  for (const audio of report.checks.tts) {
    assert.ok(audio.seconds > 0.5);
    assert.ok(audio.rms > 0.001);
  }
  console.log(JSON.stringify({ tts: report.checks.tts }));
  console.log("Checking the real sandbox SDK and order creation…");
  report.checks.paypal = await checkPayPal(browser, base);
  assert.ok(report.checks.paypal.orderCreated);
  console.log(JSON.stringify({ paypal: report.checks.paypal }));
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await writeFile(
    "artifacts/live-check.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
