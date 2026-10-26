# voice-checkout — brief for the PayPal AI Hackathon

You (Codex) do all implementation. A project manager (Claude) reviews against the checklist at the bottom and may send follow-up tasks. The human owner only creates the PayPal developer account, records the video and submits — keep anything that needs the human to a minimum and list it explicitly in `HUMAN_TODO.md`.

## Hackathon rules (summary, verified 2026-10-26 from https://paypalaihackathon.devpost.com/rules)

- Deadline: **Nov 12, 2026 12:00 PST** (= Nov 13 05:00 JST). The owner is abroad Oct 30–Nov 3 and Nov 6–8; aim to have the MVP done before Oct 30.
- Build an application that **meaningfully integrates the PayPal developer platform (free sandbox)** with an AI tool/model of our choice; PayPal integration must be central.
- Judges must be able to **actually run or interact with a working build**: a hosted demo URL and/or complete setup steps. Mockups don't count.
- Public repo with an OSS license visible in the About section (**MIT**), all source/assets/instructions; demo video < 3 min on public YouTube showing it working end to end.
- All materials in English. Judging (equal weight): technological implementation, design, potential impact, innovation, **presentation** (video clearly shows it end to end; problem, who it's for, why it matters). AI-assisted judging may be used.
- Special prizes to aim at: **Best Use of Agentic Commerce**, Best Use of PayPal + AI, Best Demo Delivery.

## Concept

**Order by voice, hear it back, pay with PayPal — an agentic checkout for people who can't easily use small screens** (elderly people, low-vision users, hands-busy situations). Japanese first, English supported.

1. The user speaks an order ("two coffees and one croissant, to go").
2. Speech recognition in the browser.
3. An AI agent turns it into a structured cart against a small product catalog, asks back when something is ambiguous, and handles edits ("make it three coffees", "cancel the croissant").
4. The cart is **read back aloud** with neural TTS running in the browser (`piper-plus`, same setup as https://github.com/ayutaz/chatstage — Japanese and English voices), with a large-text confirmation screen.
5. On a spoken "yes", the agent creates the order and opens **PayPal sandbox checkout** (PayPal JS SDK buttons / Orders v2). Show the result (order ID, status) and read it aloud.

## Constraints

- Prefer a **static site with no server and no secret**, deployable to GitHub Pages: PayPal JS SDK with a sandbox **client ID** (public by design) and client-side order creation. If you find a hard requirement for a server (e.g. capture must be server-side for a meaningful integration), propose the smallest option (e.g. a Cloudflare Pages Function) in `DECISIONS.md` and implement it behind a clean interface, but keep the static path working.
- The AI must work for judges without them bringing an API key. Options in order of preference: (a) an in-browser model (e.g. Transformers.js / WebLLM small instruct model) for cart extraction, (b) a deterministic grammar fallback so the demo never breaks. Make the agent loop explicit (tools: add_item, remove_item, set_quantity, confirm, checkout) — that is the "agentic commerce" story.
- Speech recognition: Web Speech API where available, with a text-input fallback. (Optional: in-browser Japanese ASR from https://huggingface.co/spaces/ayousanz/ralomi-demo — Apache-2.0 model — if it is easy.)
- TTS: npm `piper-plus` + `onnxruntime-web`, loaded the same way chatstage does (look at `../chatstage` for the working importmap/CDN setup; that repo is public MIT, reuse with attribution is fine).
- Vanilla ES modules, no build step, unit tests with `node --test` (Node 24). Verify in a real browser with Playwright (headless) for everything except the actual PayPal popup login.
- The PayPal sandbox client ID is read from `config.js` (committed placeholder) or a URL parameter; until the human provides one, use the generic sandbox client ID if PayPal still supports it, otherwise leave a clear placeholder.
- Python, if needed, only via `uv run --no-project python ...`.

## Deliverables

- App, tests, README (what/why/how, setup, how PayPal and AI are used, sandbox test-buyer instructions), `LICENSE` (MIT), `NOTICE` (third-party licenses incl. piper-plus voices), `.gitignore`.
- GitHub Pages-ready (the manager will turn on Pages after making the repo public).
- `SUBMISSION.md` (Devpost text, tools used and how), `VIDEO_SCRIPT.md` (≤ 3 min, end-to-end), `HUMAN_TODO.md`.
- Small logical commits with clear English messages. Do not push.

## Review checklist (manager)

- [ ] PayPal sandbox order is created and approved end to end (at least with a sandbox client ID)
- [ ] Agent loop with explicit tools; works without any API key
- [ ] Voice in / voice out in Japanese and English, text fallback
- [ ] Playwright check passes; `node --test` passes
- [ ] No secrets in git history; MIT LICENSE; NOTICE; README complete
- [ ] SUBMISSION.md / VIDEO_SCRIPT.md / HUMAN_TODO.md written
