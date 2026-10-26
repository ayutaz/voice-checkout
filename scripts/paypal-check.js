import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "./serve.js";

export async function checkPayPal(browser, base) {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1100 },
  });
  const diagnostics = {
    sdk: "real sandbox JS SDK",
    orderCreated: false,
    approved: false,
    captured: false,
    errors: [],
  };
  page.on("pageerror", (e) => diagnostics.errors.push(e.message));
  page.on("requestfailed", (req) => {
    const url = new URL(req.url());
    if (url.hostname.endsWith("paypal.com"))
      diagnostics.errors.push({
        host: url.hostname,
        path: url.pathname,
        error: req.failure()?.errorText,
      });
  });
  let popup;
  page.on("popup", (p) => {
    popup = p;
  });
  await page.goto(base + "?lang=en");
  await page.locator("#mute").click();
  await page.locator("#example-order").click();
  await page.locator("#confirm").click();
  const button = page
    .frameLocator("#paypal-buttons iframe")
    .first()
    .locator('[data-funding-source="paypal"]');
  try {
    await button.waitFor({ timeout: 60000 });
    await button.click();
    await page.waitForFunction(
      () =>
        /Order ID:|could not finish|unverified/u.test(
          document.querySelector("#payment-status").textContent +
            document.querySelector("#reply").textContent,
        ),
      null,
      { timeout: 60000 },
    );
    diagnostics.status = await page.locator("#payment-status").textContent();
    diagnostics.reply = await page.locator("#reply").textContent();
    diagnostics.orderCreated = /Order ID: [A-Z0-9]+/u.test(diagnostics.status);
    if (popup) {
      try {
        await popup.waitForURL(/https:\/\/(?:www\.)?sandbox\.paypal\.com\//u, {
          timeout: 30000,
          waitUntil: "domcontentloaded",
        });
      } catch {
        diagnostics.popupNavigation =
          "Sandbox login navigation did not finish before timeout.";
      }
    }
    diagnostics.popupHost = popup ? new URL(popup.url()).hostname : null;
    diagnostics.reason = diagnostics.orderCreated
      ? "Sandbox buyer login requires the owner."
      : "Order creation did not complete; see diagnostics.";
  } catch (e) {
    diagnostics.failure = e.message;
  }
  await page.screenshot({
    path: "artifacts/sandbox-order-created.png",
    fullPage: true,
  });
  await popup?.close();
  await page.close();
  return diagnostics;
}

if (process.argv[1]?.endsWith("paypal-check.js")) {
  const server = createServer("/voice-checkout/");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  await mkdir("artifacts", { recursive: true });
  try {
    const result = await checkPayPal(
      browser,
      `http://127.0.0.1:${server.address().port}/voice-checkout/`,
    );
    await writeFile(
      "artifacts/paypal-check.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
    if (!result.orderCreated) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
