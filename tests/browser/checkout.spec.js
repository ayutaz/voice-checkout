import { test, expect } from "@playwright/test";

async function offline(page) {
  await page.route(/^https:\/\//, (route) => route.abort());
}
async function command(page, text) {
  await page.locator("#order-input").fill(text);
  await page.locator("#order-form button").click();
}
async function sdkFixture(page, mode = "complete") {
  await page.route("https://www.sandbox.paypal.com/sdk/js?**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.paypal = { Buttons(options) {
      window.lastSdkOptions = options;
      let button;
      const actions = { order: {
        create: async payload => { window.lastOrder = payload; return 'TEST-ORDER-123'; },
        capture: async () => { ${mode === "error" ? "throw new Error('Disconnected during capture');" : `return { id: 'TEST-ORDER-123', status: '${mode === "pending" ? "APPROVED" : "COMPLETED"}', purchase_units: [{ payments: { captures: [{ id: 'TEST-CAPTURE-123', status: 'COMPLETED', amount: { currency_code: 'JPY', value: window.lastOrder.purchase_units[0].amount.value } }] } }] };`} }
      } };
      return { isEligible: () => true, render: async selector => {
        button = document.createElement('button'); button.textContent = 'PayPal fixture — test only';
        button.onclick = async () => { try { const orderID = await options.createOrder({}, actions); ${mode === "cancel" ? "options.onCancel();" : "await options.onApprove({orderID}, actions);"} } catch(e) { options.onError(e); } };
        document.querySelector(selector).append(button); options.onInit?.({}, {});
      }, close: async () => button?.remove() };
    } };
  `,
    }),
  );
}

test("English order, edit, remove, confirm and verified receipt", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await offline(page);
  await sdkFixture(page);
  await page.goto("?lang=en");
  await command(page, "two coffees and one croissant, to go");
  await expect(page.locator("#total")).toHaveText("¥980");
  await expect(page.locator("#confirmation")).toBeVisible();
  await command(page, "make it three coffees");
  await command(page, "cancel the croissant");
  await expect(page.locator("#total")).toHaveText("¥1,050");
  await page.locator("#confirm").click();
  await page
    .getByRole("button", { name: "PayPal fixture — test only" })
    .click();
  await expect(page.locator("#receipt")).toBeVisible();
  await expect(page.locator("#capture-status")).toHaveText("COMPLETED");
  await expect(page.locator("#order-id")).toHaveText("TEST-ORDER-123");
  expect(
    await page.evaluate(() => window.lastOrder.purchase_units[0].items),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.locator("#reset").click();
  await expect(page.locator("#total")).toHaveText("¥0");
  await expect(page.locator("#order-input")).toBeEnabled();
});

test("Japanese voice input, readback, spoken yes, and cancellation", async ({
  page,
}) => {
  await offline(page);
  await sdkFixture(page, "cancel");
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() {},
        speak(u) {
          window.lastSpoken = { text: u.text, lang: u.lang };
        },
      },
      configurable: true,
    });
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    window.SpeechRecognition = class {
      start() {
        this.onstart();
        window.activeRecognition = this;
      }
      abort() {
        this.onend();
      }
    };
  });
  await page.goto("./");
  await page.locator("#mic").click();
  expect(await page.evaluate(() => window.activeRecognition.lang)).toBe(
    "ja-JP",
  );
  await page.evaluate(() =>
    window.activeRecognition.onresult({
      resultIndex: 0,
      results: [[{ transcript: "コーヒーを二杯とクロワッサンを一つ" }]],
    }),
  );
  await expect(page.locator("#total")).toHaveText("￥980");
  expect(await page.evaluate(() => window.lastSpoken.lang)).toBe("ja-JP");
  expect(await page.evaluate(() => window.lastSpoken.text)).toContain("980");
  await page.locator("#mic").click();
  await page.evaluate(() =>
    window.activeRecognition.onresult({
      resultIndex: 0,
      results: [[{ transcript: "はい" }]],
    }),
  );
  await page
    .getByRole("button", { name: "PayPal fixture — test only" })
    .click();
  await expect(page.locator("#reply")).toContainText("キャンセル");
  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#receipt")).toBeHidden();
});

for (const mode of ["error", "pending"])
  test(`${mode} capture stays unverified and survives reload`, async ({
    page,
  }) => {
    await offline(page);
    await sdkFixture(page, mode);
    await page.goto("?lang=en");
    await command(page, "one coffee");
    await page.locator("#confirm").click();
    await page
      .getByRole("button", { name: "PayPal fixture — test only" })
      .click();
    await expect(page.locator("#payment-status")).toContainText("unverified");
    await expect(page.locator("#receipt")).toBeHidden();
    await expect(page.locator("#order-input")).toBeDisabled();
    await page.reload();
    await expect(page.locator("#payment-status")).toContainText(
      "TEST-ORDER-123",
    );
    await expect(page.locator("#order-input")).toBeDisabled();
    await page.locator("#reset").click();
    await expect(page.locator("#order-input")).toBeEnabled();
  });

test("unsupported speech and failed CDN downloads retain usable text checkout", async ({
  page,
}) => {
  await offline(page);
  await page.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });
  await page.goto("?lang=en");
  await expect(page.locator("#mic")).toBeDisabled();
  await expect(page.locator("#mic-status")).toContainText("text box");
  await page.locator(".enhancements summary").click();
  await page.locator("#enable-ai").click();
  await expect(page.locator("#ai-status")).toContainText("failed");
  await expect(page.locator("#voice-status")).toContainText("device voice");
  await command(page, "two coffees");
  await page.locator("#confirm").click();
  await expect(page.locator("#retry-payment")).toBeVisible();
  await expect(page.locator("#payment-status")).toContainText(
    "could not finish",
  );
});

test("ambiguous orders, invalid quantities, safe text rendering and stale confirmation", async ({
  page,
}) => {
  await offline(page);
  await page.goto("?lang=en");
  await command(page, "coffee or tea");
  await expect(page.locator("#reply")).toContainText("Which item");
  await expect(page.locator("#total")).toHaveText("¥0");
  await command(page, "<img src=x onerror=alert(1)>");
  await expect(page.locator("#transcript img")).toHaveCount(0);
  await command(page, "21 coffees");
  await expect(page.locator("#reply")).toContainText("whole quantity");
  await command(page, "two coffees");
  await page.locator("#confirm").click();
  await command(page, "one tea");
  await expect(page.locator("#payment")).toBeHidden();
  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#total")).toHaveText("¥1,000");
});

test("late SDK callbacks from an edited checkout cannot overwrite the current order", async ({
  page,
}) => {
  await offline(page);
  await sdkFixture(page);
  await page.goto("?lang=en");
  await command(page, "two coffees");
  await page.locator("#confirm").click();
  await page
    .getByRole("button", { name: "PayPal fixture — test only" })
    .waitFor();
  await command(page, "one tea");
  await page.evaluate(() =>
    window.lastSdkOptions.onError(new Error("late callback")),
  );
  await expect(page.locator("#reply")).toContainText("1 Tea");
  await expect(page.locator("#confirmation")).toBeVisible();
  await page.evaluate(() => { window.obsoleteSdkOptions = window.lastSdkOptions; });
  await page.locator("#confirm").click();
  await page
    .getByRole("button", { name: "PayPal fixture — test only" })
    .waitFor();
  await page.evaluate(() =>
    window.obsoleteSdkOptions.onError(
      new Error("late callback after a new checkout"),
    ),
  );
  await page
    .getByRole("button", { name: "PayPal fixture — test only" })
    .click();
  await expect(page.locator("#receipt")).toBeVisible();
});

test("keyboard ordering and mobile layout at 390 and 320 pixels", async ({
  page,
}) => {
  await offline(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("?lang=en");
  await page.locator("#order-input").focus();
  await page.keyboard.type("one tea");
  await page.keyboard.press("Enter");
  await expect(page.locator("#total")).toHaveText("¥300");
  await page.locator("#mute").click();
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "true");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator("#language").selectOption("ja");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.locator("#cart-items")).toContainText("紅茶");
});
