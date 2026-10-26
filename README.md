# Voice Checkout

**Order by voice, hear it back, pay with PayPal.** A Japanese-first, English-supported cafe checkout for people who find small screens difficult: older adults, people with low vision, and people with their hands full.

Speak or type an order, correct it conversationally, hear the items and total, then approve a real **PayPal sandbox** order. Large controls, visible transcripts and keyboard input provide alternatives throughout. This is a hackathon prototype; accessibility and usefulness with the target audience have not yet been validated in a user study.

## Run it — no build, server account or API key

Use Node.js 24 or later:

```sh
git clone https://github.com/ayutaz/voice-checkout.git
cd voice-checkout
npm start
```

Open **http://127.0.0.1:47135/**. No `npm install` is needed to run the static application. Any static HTTP server also works. Use localhost or HTTPS, rather than opening `index.html` as a file. If the port is occupied, set the `PORT` environment variable before starting.

Use current Chrome or Edge for microphone recognition. Japanese is the default; switch to English in the header or open `?lang=en`. Speech recognition depends on browser support, microphone permission and the provider's network service. Firefox and other browsers can still use text input and the menu. Device speech may be unavailable; all responses remain visible.

Internet access is required for PayPal, model downloads and CDNs. There is no hosted inference bill. Expand **Local AI & neural voice → Load AI & voice** to load the multilingual model and Piper voice (roughly 200 MB on first use; allow a few minutes on a slow connection). Progress and failures are visible. The model assets are browser-cached where supported. The ordinary catalog grammar works immediately, including when these downloads fail.

## Try the complete flow

1. Load AI & voice. In English, type **a buttery flaky pastry**. Local AI proposes one Croissant; say/type **yes** to accept the suggestion. This does not authorize checkout.
2. Clear the order, then speak or type **two coffees and one croissant, to go**. Hear and see the total: **JPY 980**.
3. Say **make it three coffees**, then **cancel the croissant**. The total becomes **JPY 1,050**.
4. Say **yes**, or select **Yes, continue to PayPal**. The official PayPal button appears. Select it to create the sandbox order and open PayPal approval.
5. Log in with a **sandbox personal buyer**, approve, and return. Only a verified `COMPLETED` capture produces a receipt with the order ID, capture ID and amount. The result is read aloud.

Japanese equivalents: **コーヒーを二杯とクロワッサンを一つ、持ち帰りで** → **コーヒーを三杯にして** → **クロワッサンをキャンセル** → **はい**. Both languages work regardless of the selected UI language; that setting selects recognition and readback language.

Other supported commands: `add one tea`, `remove one coffee`, `make it three` (when only one product is in the cart), `review order`, `clear order`, `no`, `紅茶を一杯`, `全部キャンセル`, `いいえ`. Use quantities 1–20 per item. A menu click adds one item. Minus/plus and Remove provide direct edits. Unsupported modifiers, alternatives, fractions and unknown products trigger a question instead of silently changing the order. For uncertain AI matches, name a catalog item explicitly.

## PayPal sandbox setup and test buyer

The committed `config.js` uses PayPal's documented public **`sb`** shortcut. Real SDK loading, order creation and navigation to sandbox login have been verified with it. No client secret is used or needed in the static demo. Do not enter real payment information.

The SDK currently warns that client-side `actions.order` is deprecated. The static sandbox path is verified working, but future removal will require a server adapter; see DECISIONS.md. Production payments should use PayPal's recommended trusted server integration.

For your own sandbox merchant:

1. Sign in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/). Under **Testing Tools → Sandbox Accounts**, use/create a Business merchant and a separate Personal buyer with a test balance. View the buyer account's sandbox login and password there.
2. Under **Apps & Credentials → Sandbox**, create/select an app attached to the Business account. Copy only its **public sandbox client ID**.
3. Replace `paypalClientId: 'sb'` in `config.js`, or open `?client-id=YOUR_PUBLIC_SANDBOX_CLIENT_ID&lang=en`. Do not copy the secret, passwords or access tokens into the app, repository, screenshots or submission.
4. Follow the flow above. The popup login uses the **Personal sandbox buyer**, not your real PayPal/Developer login or the Business merchant.
5. Verify the `COMPLETED` receipt and the capture in [sandbox Activity](https://www.sandbox.paypal.com/). Cancellation preserves the cart and requires confirmation again.

Popup blocking or SDK/network failures show a retry path. A spoken “yes” reveals and prepares checkout; the official PayPal button and PayPal approval still require the user's interaction. Browser voice-recognition callbacks cannot reliably open payment popups as a trusted user gesture. This is an approval handoff, not unattended payment.

A capture timeout, pending status, amount/currency mismatch or other uncertain result is **never shown as paid**. The order is locked, and its pending ID/amount are retained in `sessionStorage` for reload recovery. Check sandbox Activity before selecting “I checked sandbox Activity — start a new order.” Recovery requires browser storage; disabling it removes reload protection. Payment data is not shared across tabs. This static demo is unsuitable for real-money fulfillment: a production merchant must validate prices and captures on a trusted server and reconcile payments/webhooks.

## How the AI and agent work

`observe → match/plan → validate tools → execute → read back → confirm → checkout → verify capture`

- **Multilingual E5 small**, quantized ONNX, runs through Transformers.js in a dedicated WASM worker. It embeds natural descriptions and the small bilingual catalog, ranks cosine similarity, and asks about a candidate only above a threshold and margin. These scores are not calibrated confidence probabilities. A suggestion always requires acceptance, then a separate cart/payment confirmation. This is semantic retrieval, not a generative LLM.
- **Deterministic bilingual grammar** produces explicit `add_item`, `remove_item`, `set_quantity`, `set_fulfillment`, `confirm`, and `checkout` tool calls. A shadow cart validates a whole request before any mutation. Only catalog products and integer quantities are accepted. Prices come from code, never from speech/model output.
- **Piper Plus CSS10** generates Japanese and English neural speech locally using ONNX Runtime Web and WASM phonemization. The importmap/CDN setup is adapted from [ChatStage](https://github.com/ayutaz/chatstage) with MIT attribution. Device speech and visible text are explicit fallbacks.
- **Web Speech API** supplies browser speech recognition. It may use a remote browser-provider service; the app does not claim offline/private microphone transcription.
- **PayPal JS SDK / Orders v2** creates an itemized JPY order through `actions.order.create`, obtains buyer approval, and calls `actions.order.capture`. The app checks the order ID, order and capture status, capture ID, currency and exact amount. Duplicate approval callbacks share one capture promise. Cart edits revoke confirmation; payment processing locks all edits.

Expand **See the assistant’s actions** to inspect the actual tool trace. There are no simulated successful payments in the application. PayPal fixtures exist only in browser tests.

## Verify

```sh
npm ci
npx playwright install chromium
npm run verify
npm run test:live
```

`npm run verify` runs `node --test` and headless Playwright under a `/voice-checkout/` subpath, with external requests blocked and a test-only PayPal SDK fixture. It covers cart behavior, speech callbacks, UI, cancellation, capture errors, pending recovery and mobile overflow. On Linux, use `npx playwright install --with-deps chromium` when system libraries are missing.

`npm run test:live` downloads real CDN/model assets, runs real multilingual inference and Japanese/English PCM synthesis, then creates an actual sandbox order and checks the PayPal login host. It does **not** log in or approve a payment. It writes screenshots and JSON to ignored `artifacts/`. A focused SDK-only check is `node scripts/paypal-check.js`. None of these tests use or request credentials. See [VALIDATION.md](VALIDATION.md) for observed results and remaining boundaries.

## GitHub Pages

The repository root is ready to serve directly: vanilla ES modules, relative asset URLs, an importmap and `.nojekyll`. No build/upload action or backend is needed. After publication, the manager selects **Settings → Pages → Deploy from a branch → main → /(root)**. Expected URL: `https://ayutaz.github.io/voice-checkout/` (not yet published/verified). Check that the repository About section detects MIT and set its website link to the Pages URL.

Source is MIT; model/voice/service terms differ. See [NOTICE](NOTICE), [DECISIONS.md](DECISIONS.md), [SUBMISSION.md](SUBMISSION.md), [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md), and [HUMAN_TODO.md](HUMAN_TODO.md). No push or publication is performed by this implementation task.
