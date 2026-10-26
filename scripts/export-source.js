import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const dirty = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
if (dirty) throw new Error("Commit all source changes before exporting.");
await mkdir("artifacts", { recursive: true });
const target = "artifacts/voice-checkout-source.zip";
execFileSync("git", ["archive", "--format=zip", "--output=" + target, "HEAD"]);
const hash = createHash("sha256")
  .update(await readFile(target))
  .digest("hex");
await writeFile(target + ".sha256", `${hash}  voice-checkout-source.zip\n`);
console.log(`Source archive: ${target}\nSHA-256: ${hash}`);
