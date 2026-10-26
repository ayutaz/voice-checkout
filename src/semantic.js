export class SemanticMatcher {
  constructor(onProgress = () => {}) {
    this.onProgress = onProgress;
    this.pending = new Map();
    this.nextId = 0;
    this.ready = false;
  }
  request(type, text) {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./semantic-worker.js", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = ({ data }) => {
        if (data.type === "progress") {
          this.onProgress(data.progress);
          return;
        }
        const p = this.pending.get(data.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(data.id);
        data.error ? p.reject(new Error(data.error)) : p.resolve(data.value);
      };
      this.worker.onerror = () =>
        this.dispose(
          new Error("Local AI could not load. Catalog commands still work."),
        );
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.dispose(new Error("Local AI timed out. Retry the download.")),
        type === "load" ? 180000 : 30000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type, text });
    });
  }
  async load() {
    await this.request("load");
    this.ready = true;
  }
  match(text) {
    return this.ready
      ? this.request("match", text.slice(0, 500))
      : Promise.resolve(null);
  }
  dispose(error = new Error("Local AI stopped.")) {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }
}
