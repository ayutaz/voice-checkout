import { test, expect } from "@playwright/test";

test("a semantic suggestion needs acceptance and then separate payment confirmation", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  // Test double only at the worker network boundary; real inference has a separate live check.
  await page.route("**/src/semantic-worker.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    self.onmessage = ({data}) => self.postMessage({id: data.id, value: data.type === 'load' ? true : {id: 'croissant', quantity: 1, score: 0.9}});
  `,
    }),
  );
  await page.goto("?lang=en");
  await page.locator(".enhancements summary").click();
  await page.locator("#enable-ai").click();
  await expect(page.locator("#ai-status")).toContainText("AI ready");
  await page.locator("#order-input").fill("a buttery flaky pastry");
  await page.locator("#order-form button").click();
  await expect(page.locator("#reply")).toContainText(
    "Did you mean one Croissant",
  );
  await expect(page.locator("#total")).toHaveText("¥0");
  await expect(page.locator("#confirmation")).toBeHidden();
  await page.locator("#order-input").fill("yes");
  await page.locator("#order-form button").click();
  await expect(page.locator("#total")).toHaveText("¥280");
  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#payment")).toBeHidden();
});

test("keyboard focus survives menu and quantity edits", async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("?lang=en");
  const add = page.getByRole("button", { name: "Add Coffee ¥350" });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(add).toBeFocused();
  const increase = page.getByRole("button", { name: "Increase Coffee" });
  await increase.focus();
  await page.keyboard.press("Enter");
  await expect(increase).toBeFocused();
  await expect(page.locator("#total")).toHaveText("¥700");
});
