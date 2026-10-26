import test from "node:test";
import assert from "node:assert/strict";
import { Agent } from "../src/agent.js";
import {
  PayPalCheckout,
  orderPayload,
  verifyCapture,
  sdkURL,
} from "../src/paypal.js";

const ready = () => {
  const a = new Agent();
  a.turn("two coffees and one croissant");
  a.turn("yes");
  return a;
};
const receipt = (extra = {}) => ({
  id: "ORDER-123",
  status: "COMPLETED",
  purchase_units: [
    {
      payments: {
        captures: [
          {
            id: "CAPTURE-123",
            status: "COMPLETED",
            amount: { currency_code: "JPY", value: "980" },
          },
        ],
      },
    },
  ],
  ...extra,
});
test("Orders v2 item breakdown uses integer JPY and no shipping", () => {
  const payload = orderPayload(ready().beginPayment());
  assert.equal(payload.purchase_units[0].amount.value, "980");
  assert.equal(payload.purchase_units[0].items[0].quantity, "2");
  assert.equal(payload.application_context.shipping_preference, "NO_SHIPPING");
  assert.equal(payload.intent, "CAPTURE");
});
test("create requires fresh confirmation and captures exactly once", async () => {
  const a = ready();
  let calls = 0;
  const p = new PayPalCheckout(a);
  const actions = {
    order: {
      create: async () => "ORDER-123",
      capture: async () => {
        calls++;
        return receipt();
      },
    },
  };
  await p.create({}, actions);
  await assert.rejects(() => p.create({}, actions));
  const [r1, r2] = await Promise.all([
    p.approve({ orderID: "ORDER-123" }, actions),
    p.approve({ orderID: "ORDER-123" }, actions),
  ]);
  assert.equal(calls, 1);
  assert.equal(r1.captureId, r2.captureId);
  assert.equal(a.phase, "complete");
});
test("capture failure and pending are never marked paid", async () => {
  for (const capture of [
    async () => {
      throw new Error("network lost");
    },
    async () => receipt({ status: "APPROVED" }),
  ]) {
    const a = ready();
    const p = new PayPalCheckout(a);
    await p.create({}, { order: { create: async () => "ORDER-123" } });
    await assert.rejects(() =>
      p.approve({ orderID: "ORDER-123" }, { order: { capture } }),
    );
    assert.equal(a.phase, "uncertain");
    assert.throws(() => a.beginPayment());
  }
});
test("mismatched order, amount, currency or capture status rejected", () => {
  const snapshot = ready().beginPayment();
  for (const details of [
    receipt({ id: "OTHER" }),
    receipt({ status: "APPROVED" }),
    ...["979", "981", "NaN"].map((value) => {
      const r = receipt();
      r.purchase_units[0].payments.captures[0].amount.value = value;
      return r;
    }),
    (() => {
      const r = receipt();
      r.purchase_units[0].payments.captures[0].amount.currency_code = "USD";
      return r;
    })(),
    (() => {
      const r = receipt();
      r.purchase_units[0].payments.captures[0].status = "PENDING";
      return r;
    })(),
  ])
    assert.throws(() => verifyCapture(details, "ORDER-123", snapshot));
});
test("cancellation retains cart and requires confirmation again", async () => {
  const a = ready();
  const p = new PayPalCheckout(a);
  await p.create({}, { order: { create: async () => "ORDER-123" } });
  p.cancel();
  assert.equal(a.phase, "review");
  assert.equal(a.confirmedRevision, null);
  assert.equal(a.cart.coffee, 2);
});
test("SDK URL validates public IDs and uses sandbox host", () => {
  assert.equal(new URL(sdkURL("sb")).hostname, "www.sandbox.paypal.com");
  assert.equal(new URL(sdkURL("sb")).searchParams.get("currency"), "JPY");
  for (const id of [
    "",
    "your-client-id",
    "a&currency=USD",
    "https://evil.example",
  ])
    assert.throws(() => sdkURL(id));
});
