import { Agent } from "./agent.js";
import { CATALOG, product, total, money, MAX_QUANTITY } from "./catalog.js";
import { copy } from "./i18n.js";
import { SpeechInput, SpeechOutput } from "./speech.js";
import { SemanticMatcher } from "./semantic.js";
import { loadPayPal, PayPalCheckout } from "./paypal.js";
import { config } from "../config.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let language = params.get("lang") === "en" ? "en" : "ja";
let agent = new Agent(),
  override = "",
  aiState = "aiInitial",
  voiceState = "voiceInitial",
  progress = "",
  busy = false;
let buttons,
  paymentController,
  paymentEpoch = 0,
  paymentMessage = "",
  recovery;
const clientId = params.get("client-id") ?? config.paypalClientId;
const t = (key) => copy[language][key] ?? key;
const pendingKey = "voice-checkout.pending-payment.v1";
function savePending(value) {
  try {
    value
      ? sessionStorage.setItem(pendingKey, JSON.stringify(value))
      : sessionStorage.removeItem(pendingKey);
  } catch {
    /* Storage may be disabled. Checkout still works in this page. */
  }
}
try {
  recovery = JSON.parse(sessionStorage.getItem(pendingKey));
} catch {
  recovery = null;
}
if (
  recovery &&
  typeof recovery.orderId === "string" &&
  Number.isInteger(recovery.amount)
) {
  agent.phase = "uncertain";
  paymentMessage = `${t("restored")}\nOrder ID: ${recovery.orderId}\n${money(recovery.amount, language)}`;
} else recovery = null;

const speech = new SpeechOutput((state, info) => {
  voiceState =
    {
      loading: "voiceLoading",
      ready: "voiceReady",
      speaking: "voiceSpeaking",
      fallback: "voiceFallback",
      captions: "voiceCaptions",
    }[state] ?? "voiceInitial";
  $("voice-status").textContent =
    t(voiceState) +
    (state === "loading" && Number.isFinite(info?.progress)
      ? ` ${Math.round(info.progress * 100)}%`
      : "");
});
const semantic = new SemanticMatcher((info) => {
  if (Number.isFinite(info.progress)) {
    progress = ` ${Math.round(info.progress)}%`;
    $("ai-status").textContent = t("aiLoading") + progress;
  }
});
const mic = new SpeechInput({
  onText: (text) => send(text),
  onState: (active) => {
    $("mic").setAttribute("aria-pressed", String(active));
    $("mic").querySelector("span").textContent = t(
      active ? "listening" : "speak",
    );
  },
  onError: (code) => {
    $("mic-status").textContent = t(
      code === "unsupported"
        ? "micUnsupported"
        : code === "not-allowed" || code === "service-not-allowed"
          ? "micDenied"
          : "micError",
    );
  },
  beforeListen: () => speech.stop(),
});

function reply() {
  if (override) return override;
  if (agent.question === "suggestion")
    return t("suggestion").replace(
      "{item}",
      product(agent.suggestion.id)[language],
    );
  if (agent.question) return t(agent.question);
  if (agent.phase === "complete")
    return `${t("success")} ${money(total(agent.cart), language)}. Order ID: ${paymentController?.result?.orderId ?? ""}`;
  if (agent.phase === "uncertain") return t("restored");
  if (agent.phase === "processing") return paymentMessage || t("creating");
  if (agent.phase === "checkout") return t("checkout");
  if (!Object.keys(agent.cart).length) return t("greeting");
  const contents = Object.entries(agent.cart)
    .map(([id, q]) =>
      language === "ja"
        ? `${product(id).ja} ${q} 点`
        : `${q} ${product(id).en}`,
    )
    .join(language === "ja" ? "、" : ", ");
  const stop = language === "ja" ? "。" : ".";
  return `${t("readback")} ${contents}${stop}\n${t(agent.fulfillment)}${stop} ${t("total")} ${money(total(agent.cart), language)}${stop}\n${t("askConfirm")}`;
}
function announce() {
  speech.say(reply(), language);
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function render() {
  const focusKey = document.activeElement?.dataset.focusKey;
  document.documentElement.lang = language;
  $("language").value = language;
  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("order-input").placeholder = t("placeholder");
  $("reply").textContent = reply();
  $("ai-status").textContent =
    t(aiState) + (aiState === "aiLoading" ? progress : "");
  $("voice-status").textContent = t(voiceState);
  $("mic").setAttribute("aria-pressed", String(mic.active));
  $("mic").querySelector("span").textContent = t(
    mic.active ? "listening" : "speak",
  );
  $("mic-status").textContent ||= t(
    mic.supported ? "micReady" : "micUnsupported",
  );
  $("mute").textContent = t(speech.enabled ? "mute" : "unmute");
  $("mute").setAttribute("aria-pressed", String(!speech.enabled));
  const locked = agent.locked;
  $("menu").replaceChildren(
    ...CATALOG.map((p) => {
      const button = element("button", undefined, "product");
      button.type = "button";
      button.disabled = locked || busy;
      button.dataset.focusKey = `menu-${p.id}`;
      button.setAttribute(
        "aria-label",
        `${t("add")} ${p[language]} ${money(p.price, language)}`,
      );
      const image = element("img");
      image.src = `assets/${p.id}.svg`;
      image.alt = "";
      button.append(
        image,
        element("strong", p[language]),
        element("span", money(p.price, language), "price"),
        element("span", "+", "add"),
      );
      button.addEventListener("click", () =>
        useTool("add_item", { id: p.id, quantity: 1 }),
      );
      return button;
    }),
  );
  $("cart-count").textContent = String(
    Object.values(agent.cart).reduce((s, q) => s + q, 0),
  );
  $("fulfillment").textContent = t(agent.fulfillment);
  const rows = Object.entries(agent.cart).map(([id, q]) => {
    const row = element("div", undefined, "cart-item");
    row.dataset.product = id;
    const head = element("div", undefined, "cart-item-head");
    head.append(
      element("strong", product(id)[language]),
      element("span", money(product(id).price * q, language)),
    );
    const actions = element("div", undefined, "cart-item-actions");
    for (const [text, label, value] of [
      ["−", "decrease", q - 1],
      ["+", "increase", q + 1],
    ]) {
      const button = element("button", text);
      button.type = "button";
      button.disabled = locked || busy || value > MAX_QUANTITY;
      button.dataset.focusKey = `${label}-${id}`;
      button.setAttribute("aria-label", `${t(label)} ${product(id)[language]}`);
      button.addEventListener("click", () =>
        useTool("set_quantity", { id, quantity: value }),
      );
      actions.append(button);
      if (text === "−") actions.append(element("span", String(q), "quantity"));
    }
    const remove = element("button", t("remove"), "remove");
    remove.type = "button";
    remove.disabled = locked || busy;
    remove.setAttribute(
      "aria-label",
      `${t("remove")} ${product(id)[language]}`,
    );
    remove.dataset.focusKey = `remove-${id}`;
    remove.addEventListener("click", () =>
      useTool("remove_item", { id, quantity: null }),
    );
    actions.append(remove);
    row.append(head, actions);
    return row;
  });
  $("cart-items").replaceChildren(
    ...(rows.length ? rows : [element("p", t("emptyCart"), "empty-cart")]),
  );
  $("total").textContent = money(total(agent.cart), language);
  $("confirmation").hidden =
    agent.phase !== "review" || Boolean(agent.question);
  $("confirm").disabled = busy;
  $("payment").hidden = !["checkout", "processing", "uncertain"].includes(
    agent.phase,
  );
  $("payment-status").textContent = paymentMessage;
  $("paypal-buttons").inert =
    ["processing", "uncertain"].includes(agent.phase) ||
    (agent.phase === "checkout" &&
      Boolean(paymentController) &&
      !paymentController.ready);
  $("receipt").hidden = agent.phase !== "complete";
  if (paymentController?.result) {
    const r = paymentController.result;
    $("order-id").textContent = r.orderId;
    $("capture-id").textContent = r.captureId;
    $("capture-status").textContent = r.status;
    $("receipt-summary").textContent = money(r.amount, language);
  }
  $("order-input").disabled = locked || busy;
  $("order-form").querySelector("button").disabled = locked || busy;
  $("mic").disabled = locked || busy || !mic.supported;
  $("reset").disabled = agent.phase === "processing";
  $("reset").textContent = t(
    agent.phase === "complete"
      ? "newOrder"
      : agent.phase === "uncertain"
        ? "recovery"
        : "reset",
  );
  $("example-order").textContent = t("exampleOrder");
  $("example-edit").textContent = t("exampleEdit");
  $("example-order").disabled = locked || busy;
  $("example-edit").disabled = locked || busy;
  $("tool-log").replaceChildren(
    ...agent.trace.map((entry) =>
      element(
        "li",
        `${entry.tool}(${JSON.stringify(entry.args)}) → revision ${entry.revision}`,
      ),
    ),
  );
  const step = ["checkout", "processing", "complete", "uncertain"].includes(
    agent.phase,
  )
    ? "pay"
    : agent.phase === "review"
      ? "review"
      : "order";
  for (const name of ["order", "review", "pay"]) {
    $(`step-${name}`).classList.toggle("active", step === name);
    if (step === name) $(`step-${name}`).setAttribute("aria-current", "step");
    else $(`step-${name}`).removeAttribute("aria-current");
  }
  if (agent.phase === "checkout" && !buttons && !paymentController)
    mountPayment();
  else if (
    !["checkout", "processing", "complete", "uncertain"].includes(agent.phase)
  )
    unmountPayment();
  if (focusKey) {
    const target = [...document.querySelectorAll("[data-focus-key]")].find(
      (el) => el.dataset.focusKey === focusKey,
    );
    (target && !target.disabled ? target : $("order-input")).focus({
      preventScroll: true,
    });
  }
}
function unmountPayment() {
  paymentEpoch++;
  const old = buttons;
  buttons = null;
  if (old) Promise.resolve(old.close()).catch(() => {});
  paymentController = null;
  $("paypal-buttons").replaceChildren();
}
async function mountPayment() {
  const epoch = ++paymentEpoch;
  paymentController = new PayPalCheckout(agent, (event) => {
    if (epoch === paymentEpoch) paymentChanged(event);
  });
  const controller = paymentController;
  $("paypal-buttons").inert = true;
  $("paypal-buttons").setAttribute("aria-busy", "true");
  $("retry-payment").hidden = true;
  paymentMessage = t("creating").replace("…", "");
  $("payment-status").textContent =
    language === "ja" ? "PayPal を読み込み中…" : "Loading PayPal…";
  try {
    const paypal = await loadPayPal(clientId);
    if (epoch !== paymentEpoch || agent.phase !== "checkout") return;
    const options = controller.options();
    for (const [name, handler] of Object.entries(options)) {
      if (typeof handler !== "function") continue;
      options[name] = (...args) => {
        if (epoch !== paymentEpoch) {
          if (name === "createOrder")
            throw new Error("This checkout was replaced.");
          return;
        }
        return handler(...args);
      };
    }
    buttons = paypal.Buttons(options);
    if (!buttons.isEligible())
      throw new Error("PayPal is not eligible in this browser.");
    await buttons.render("#paypal-buttons");
    if (epoch !== paymentEpoch) return;
    paymentMessage = "";
    $("payment-status").textContent = "";
  } catch {
    if (epoch !== paymentEpoch) return;
    paymentMessage = t("paymentError");
    $("paypal-buttons").setAttribute("aria-busy", "false");
    $("payment-status").textContent = paymentMessage;
    $("retry-payment").hidden = false;
  }
}
function paymentChanged(event) {
  const { type, orderId, result } = event;
  if (type === "ready") {
    $("paypal-buttons").inert = false;
    $("paypal-buttons").setAttribute("aria-busy", "false");
    return;
  }
  override = "";
  if (type === "created") savePending({ orderId, amount: total(agent.cart) });
  if (type === "complete" || type === "cancelled" || type === "error")
    savePending(null);
  paymentMessage =
    type === "created"
      ? t("created") + orderId
      : type === "uncertain"
        ? t("uncertain") + (orderId ?? "—")
        : t(type === "error" ? "paymentError" : type);
  if (["cancelled", "error"].includes(type)) override = paymentMessage;
  render();
  if (["complete", "cancelled", "error", "uncertain"].includes(type))
    announce();
  if (result) {
    $("receipt").focus();
    $("paypal-buttons").hidden = true;
  }
}
function useTool(tool, args) {
  if (agent.locked || busy) return;
  mic.stop();
  speech.unlock();
  override = "";
  paymentMessage = "";
  try {
    agent.tool(tool, args);
    agent.tool("confirm");
  } catch {
    agent.question = "quantity";
  }
  render();
  announce();
}
async function send(text) {
  if (agent.locked || busy || !text.trim()) return;
  mic.stop();
  speech.unlock();
  override = "";
  paymentMessage = "";
  $("transcript").hidden = false;
  $("transcript").textContent = `“${text.slice(0, 500)}”`;
  agent.turn(text);
  if (agent.question === "unknown" && semantic.ready) {
    busy = true;
    const revision = agent.revision;
    override = t("modelMatching");
    render();
    try {
      const suggestion = await semantic.match(text);
      if (suggestion && agent.revision === revision) agent.suggest(suggestion);
    } catch {
      aiState = "aiFailed";
      semantic.dispose();
      $("enable-ai").disabled = false;
    } finally {
      busy = false;
      override = "";
    }
  }
  render();
  announce();
  if (agent.phase === "checkout")
    $("payment").scrollIntoView({ behavior: "auto", block: "nearest" });
}
$("order-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("order-input").value;
  $("order-input").value = "";
  send(text);
});
$("mic").addEventListener("click", () => {
  speech.unlock();
  mic.start(language);
});
$("repeat").addEventListener("click", () => {
  mic.stop();
  speech.unlock();
  announce();
});
$("mute").addEventListener("click", () => {
  speech.enabled = !speech.enabled;
  speech.stop();
  render();
  if (speech.enabled) {
    speech.unlock();
    announce();
  }
});
$("confirm").addEventListener("click", () => send(t("yes")));
$("edit").addEventListener("click", () => {
  send(t("no"));
  $("order-input").focus();
});
$("example-order").addEventListener("click", () =>
  send(
    language === "ja"
      ? "コーヒーを二杯とクロワッサンを一つ、持ち帰りで"
      : "two coffees and one croissant, to go",
  ),
);
$("example-edit").addEventListener("click", () =>
  send(language === "ja" ? "コーヒーを三杯にして" : "make it three coffees"),
);
$("language").addEventListener("change", (event) => {
  mic.stop();
  speech.stop();
  language = event.target.value;
  override = "";
  $("mic-status").textContent = "";
  render();
});
$("retry-payment").addEventListener("click", () => {
  unmountPayment();
  render();
});
$("reset").addEventListener("click", () => {
  if (agent.phase === "processing") return;
  savePending(null);
  recovery = null;
  mic.stop();
  speech.stop();
  unmountPayment();
  agent = new Agent();
  override = "";
  paymentMessage = "";
  $("paypal-buttons").hidden = false;
  $("transcript").hidden = true;
  $("retry-payment").hidden = true;
  render();
  $("order-input").focus();
});
$("enable-ai").addEventListener("click", async () => {
  speech.unlock();
  $("enable-ai").disabled = true;
  aiState = "aiLoading";
  voiceState = "voiceLoading";
  render();
  const results = await Promise.allSettled([
    semantic.load().then(() => {
      aiState = "aiReady";
      $("ai-status").textContent = t(aiState);
    }),
    speech.enableNeural(),
  ]);
  if (results[0].status === "rejected") aiState = "aiFailed";
  if (results[1].status === "rejected") voiceState = "voiceFallback";
  $("enable-ai").disabled = results.every((r) => r.status === "fulfilled");
  render();
  announce();
});
render();
