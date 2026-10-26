# Manager handoff

The app is complete locally. Do not push from this implementation session. Human-only account/video/submission actions are in HUMAN_TODO.md; they are not prerequisites for reviewing the code or rerunning the automated tests.

## Review and finish account verification

Run `npm ci`, `npx playwright install chromium`, `npm run verify` and optionally `npm run test:live`. See VALIDATION.md for the distinction between real model/SDK checks, fixture-based payment tests, and the still-unverified buyer-approved capture. After the owner completes the approved sandbox payment, update VALIDATION.md and the verification disclosure in SUBMISSION.md using the actual result. Never insert buyer credentials or a PayPal secret. A public sandbox client ID can be committed to config.js if supplied.

## Prepare public source without the bootstrap history

The supplied initial commit contains a workstation path in its original brief and a Git author/committer identity that is not a public noreply address. New commits use a repository-local public GitHub handle/noreply identity; current source contains no workstation path. No history was rewritten and no publication occurred. The private bootstrap history should not be published unchanged.

`node scripts/export-source.js` produces an ignored **artifacts/voice-checkout-source.zip**, a source-only archive of the committed tree, plus a SHA-256 sidecar. It includes code, tests, MIT license, attribution and all setup/submission documents. It excludes `.git`, ignored artifacts, model downloads, node_modules and private logs. The archive has no author/email commit metadata. Use that clean snapshot to initialize the public repository with a fresh public-handle/noreply Git identity, or obtain explicit authorization for a history-sanitization operation on the existing private repository before publishing its history. The archive provides a complete code submission without rewriting existing commits. Do not force-push or change remote visibility without the corresponding publication authorization.

## Publication (manager-owned, after authorization)

Make the clean source public and verify GitHub detects the root MIT LICENSE. Enable Pages from the root of the main branch. Set About description to “A bilingual voice-first cafe checkout with local AI, neural speech, and PayPal sandbox” and website to the verified Pages URL. No credentials or deployment secret are necessary for Pages. GitHub Actions runs the offline deterministic checks; it does not create payments or require PayPal credentials.

Check the hosted application while logged out, including the project subpath, English/Japanese readback, neural download statuses and a real sandbox order. Update SUBMISSION.md with the actual hosted URL only after this check. A working README setup is already an allowed judging access path under the rules.

After receiving the owner's public YouTube URL, insert it in SUBMISSION.md and confirm the running behavior matches the narration. No claim of an approved payment, human-tested accessibility, real-money readiness or public deployment should exceed the recorded evidence.
