import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
import { CATALOG } from "./catalog.js";

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let extractor, embeddings;
async function initialize() {
  if (extractor) return;
  extractor = await pipeline(
    "feature-extraction",
    "Xenova/multilingual-e5-small",
    {
      revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
      device: "wasm",
      dtype: "q8",
      progress_callback: (progress) =>
        self.postMessage({ type: "progress", progress }),
    },
  );
  embeddings = (
    await extractor(
      CATALOG.map((p) => `query: ${p.en}. ${p.ja}. ${p.description}`),
      { pooling: "mean", normalize: true },
    )
  ).tolist();
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      await initialize();
      if (data.type === "load") {
        self.postMessage({ id: data.id, value: true });
        return;
      }
      const [vector] = (
        await extractor(`query: ${data.text}`, {
          pooling: "mean",
          normalize: true,
        })
      ).tolist();
      const scores = embeddings
        .map((v, i) => ({
          id: CATALOG[i].id,
          score: v.reduce((s, x, j) => s + x * vector[j], 0),
        }))
        .sort((a, b) => b.score - a.score);
      // Scores are similarities, not probabilities. Always ask the user before adding.
      const best = scores[0];
      self.postMessage({
        id: data.id,
        value:
          best.score >= 0.76 && best.score - scores[1].score >= 0.025
            ? { ...best, quantity: 1 }
            : null,
      });
    } catch (error) {
      self.postMessage({ id: data.id, error: error.message });
    }
  });
};
