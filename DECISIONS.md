# Implementation decisions

## Static sandbox integration

Keep the application entirely static. The actual v5 SDK supports `actions.order.create` and `actions.order.capture`; real sandbox order creation works with `client-id=sb`. No hard backend requirement was found for this sandbox prototype. `src/paypal.js` contains the SDK adapter, order payload construction and capture verification, separate from the cart/voice/UI layers. A future trusted adapter can replace create/capture without changing the agent tool contract.

The SDK is loaded directly from `https://www.sandbox.paypal.com/sdk/js`, with JPY, capture intent and only the PayPal funding flow. The sandbox hostname prevents accidentally selecting a production SDK endpoint. Invalid public-ID syntax is rejected. The committed `sb` ID is public by design. No secrets, OAuth bearer tokens or server are used.

The live SDK emits a deprecation warning for client-side `actions.order` and recommends a server integration. It still creates sandbox orders successfully at the observed check date. This is a legacy sandbox path, not a promise of future SDK support; a removal would require migrating the adapter to a small trusted backend. A production integration should already use PayPal's recommended server flow.

Static clients cannot defend merchant prices or a fulfillment system from browser tampering. This application is explicitly a sandbox demo with no fulfillment. Before real-money use, replace the adapter with a trusted create/capture backend that prices from the catalog, validates ownership, provides idempotency and reconciles webhooks. Do not present the browser receipt as a trusted merchant ledger. No Cloudflare account or deployment is necessary for the brief.

## Bounded local AI instead of an unverified generated cart

Use `Xenova/multilingual-e5-small` (q8, pinned model revision) through Transformers.js 3.8.1 for bilingual catalog retrieval. Prefix all embeddings with `query:`, mean-pool and normalize, following the model card. A WASM worker avoids requiring WebGPU, cross-origin isolation or SharedArrayBuffer on GitHub Pages. Threshold 0.76 and top-two margin 0.025 are conservative demo heuristics, not an evaluated accuracy guarantee. All candidates need user acceptance and still need a separate reviewed-cart confirmation.

This is a retrieval-assisted tool agent, not an instruct-model/LLM agent. A small generative model would add a much larger download and unconstrained output without improving the three-product demonstration. The neural voice is also a substantive on-device AI component. Grammar handles exact orders, quantities and edits; semantic AI handles natural product descriptions and asks back. Unsupported compound instructions remain questions. Neural downloads are opt-in with progress, retry, and an explicit grammar/device-voice fallback, so judges do not need keys or compatible GPUs.

## Voice and accessibility

Default Japanese UI; English selectable. All repository/submission materials are English, and both languages can be demonstrated. Speech recognition uses Web Speech with text/menu alternatives. Piper Plus 0.8.2 + ONNX Runtime Web 1.30.0 use the proven ChatStage importmap and single-thread setup. CSS10 model revision is pinned; the WASM phonemizer bundles the Japanese dictionary. Third-party terms are documented separately from MIT source licensing.

Audio is unlocked by a user gesture. Stopping, changing the language or starting the microphone invalidates stale speech. Neural synthesis is serialized. No simultaneous listening and readback; each utterance uses a fresh tap, limiting feedback loops. Device speech is a labeled fallback; absent speech support leaves full text visible. The user still selects PayPal's official button and approves within PayPal; synthetic clicks from voice callbacks are not used.

Use a fixed three-product JPY cafe catalog: Coffee 350, Tea 300, Croissant 280. All prices include demo tax; fulfillment is takeaway/eat in with no shipping or price difference. Large type, target sizes, focus indicators, labeled quantity controls, live readback text, keyboard forms and a visible receipt support access. These are implementation choices, not a claim of certified accessibility or human usability testing.

## Verification and publication

Unit tests and browser tests distinguish real assets, simulated speech API callbacks, test-only SDK fixtures, real sandbox order creation and actual approved capture. Only the last needs account access. No payer data is logged/stored. A minimal pending ID/amount is tab-scoped for uncertain-payment recovery; no cart/transcript is persisted.

The supplied initial commit includes machine-specific brief text and a non-public-noreply Git identity. Its history has not been rewritten, and nothing has been pushed. New commits use repository-local public-handle/noreply identity. Current brief text is sanitized. The manager can publish a clean source archive with fresh public identity rather than exposing the supplied bootstrap history; see MANAGER_HANDOFF.md. This is a publication preparation task, not an additional credential task for the human owner.

## Primary references checked during implementation

- [PayPal SDK v5 configuration (`sb` shortcut)](https://developer.paypal.com/sdk/js/v5/configuration)
- [PayPal SDK v5 reference](https://developer.paypal.com/sdk/js/v5/reference/)
- [PayPal production integration guidance](https://developer.paypal.com/checkout/integrate)
- [Transformers.js documentation](https://huggingface.co/docs/transformers.js/en/index)
- [E5 base model and embedding prefixes](https://huggingface.co/intfloat/multilingual-e5-small)
- [E5 ONNX conversion](https://huggingface.co/Xenova/multilingual-e5-small)
- [Piper browser setup](https://github.com/ayutaz/piper-plus/blob/dev/src/wasm/openjtalk-web/README.npm.md)
- [CSS10 model terms](https://huggingface.co/ayousanz/piper-plus-css10-ja-6lang)
- [Hackathon rules](https://paypalaihackathon.devpost.com/rules), checked October 26, 2026: setup instructions can satisfy the functional-demo requirement; a public code repository and public YouTube video are still required.
