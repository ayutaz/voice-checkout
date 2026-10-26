import { product } from "./catalog.js";

export function sdkURL(clientId) {
  if (clientId !== "sb" && !/^[A-Za-z0-9_-]{30,200}$/u.test(clientId))
    throw new Error("Provide a public PayPal sandbox client ID.");
  const url = new URL("https://www.sandbox.paypal.com/sdk/js");
  url.search = new URLSearchParams({
    "client-id": clientId,
    currency: "JPY",
    intent: "capture",
    components: "buttons",
    "disable-funding": "card,credit,paylater,venmo",
    locale: "en_US",
  });
  return url.href;
}

export function orderPayload(snapshot) {
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        description: `Voice Checkout cafe · ${snapshot.fulfillment === "takeaway" ? "Takeaway" : "Eat in"}`,
        amount: {
          currency_code: "JPY",
          value: String(snapshot.amount),
          breakdown: {
            item_total: {
              currency_code: "JPY",
              value: String(snapshot.amount),
            },
          },
        },
        items: Object.entries(snapshot.cart).map(([id, quantity]) => ({
          name: product(id).en,
          sku: id,
          quantity: String(quantity),
          unit_amount: {
            currency_code: "JPY",
            value: String(product(id).price),
          },
          category: "PHYSICAL_GOODS",
        })),
      },
    ],
    application_context: {
      brand_name: "Voice Checkout · SANDBOX",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };
}

export function verifyCapture(details, orderId, snapshot) {
  const captures =
    details?.purchase_units?.flatMap((u) => u.payments?.captures ?? []) ?? [];
  const c = captures[0];
  if (
    details?.id !== orderId ||
    details.status !== "COMPLETED" ||
    captures.length !== 1 ||
    !c?.id ||
    c.status !== "COMPLETED" ||
    c.amount?.currency_code !== "JPY" ||
    !/^\d+(?:\.0+)?$/u.test(c.amount.value) ||
    Number(c.amount.value) !== snapshot.amount
  )
    throw new Error(
      "Payment is not verified. Check the sandbox Activity before trying again.",
    );
  return {
    orderId,
    captureId: c.id,
    status: c.status,
    amount: snapshot.amount,
  };
}

export class PayPalCheckout {
  constructor(agent, onChange = () => {}) {
    this.agent = agent;
    this.onChange = onChange;
    this.orderId = null;
    this.capturePromise = null;
    this.snapshot = null;
    this.result = null;
    this.ready = false;
  }
  async create(_data, actions) {
    if (this.snapshot) throw new Error("Order already started.");
    this.snapshot = this.agent.beginPayment();
    this.onChange({ type: "creating" });
    try {
      this.orderId = await actions.order.create(orderPayload(this.snapshot));
      if (!this.orderId || typeof this.orderId !== "string")
        throw new Error("Missing PayPal order ID.");
      this.onChange({ type: "created", orderId: this.orderId });
      return this.orderId;
    } catch (error) {
      this.agent.paymentCancelled();
      this.onChange({ type: "error", error });
      throw error;
    }
  }
  approve(data, actions) {
    if (this.capturePromise) return this.capturePromise;
    if (
      !this.snapshot ||
      !this.orderId ||
      data.orderID !== this.orderId ||
      this.agent.phase !== "processing"
    )
      return Promise.reject(new Error("Unexpected PayPal approval."));
    this.capturePromise = this.capture(actions);
    return this.capturePromise;
  }
  async capture(actions) {
    this.onChange({ type: "capturing", orderId: this.orderId });
    try {
      const details = await actions.order.capture();
      this.result = verifyCapture(details, this.orderId, this.snapshot);
      this.agent.phase = "complete";
      this.onChange({ type: "complete", result: this.result });
      return this.result;
    } catch (error) {
      this.agent.phase = "uncertain";
      this.onChange({ type: "uncertain", orderId: this.orderId, error });
      throw error;
    }
  }
  cancel() {
    if (this.capturePromise || this.agent.phase === "complete") return;
    this.agent.paymentCancelled();
    this.onChange({ type: "cancelled", orderId: this.orderId });
  }
  error(error) {
    if (this.agent.phase === "complete" || this.agent.phase === "uncertain")
      return;
    if (this.capturePromise) {
      this.agent.phase = "uncertain";
      this.onChange({ type: "uncertain", error, orderId: this.orderId });
    } else {
      this.agent.paymentCancelled();
      if (this.agent.phase === "checkout") this.agent.phase = "review";
      this.onChange({ type: "error", error });
    }
  }
  options() {
    return {
      style: {
        layout: "vertical",
        color: "gold",
        shape: "rect",
        label: "pay",
        height: 55,
        tagline: false,
      },
      onInit: () => {
        this.ready = true;
        this.onChange({ type: "ready" });
      },
      createOrder: (data, actions) => this.create(data, actions),
      onApprove: (data, actions) => this.approve(data, actions),
      onCancel: () => this.cancel(),
      onError: (error) => this.error(error),
    };
  }
}

let sdkPromise;
export function loadPayPal(clientId) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = sdkURL(clientId);
    script.async = true;
    const timeout = setTimeout(() => {
      script.remove();
      sdkPromise = null;
      reject(new Error("PayPal download timed out."));
    }, 25000);
    script.onload = () => {
      clearTimeout(timeout);
      window.paypal
        ? resolve(window.paypal)
        : reject(new Error("PayPal SDK unavailable."));
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      sdkPromise = null;
      reject(
        new Error(
          "PayPal could not load. Check your connection and sandbox client ID.",
        ),
      );
    };
    document.head.append(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}
