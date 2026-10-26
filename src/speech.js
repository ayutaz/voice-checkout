// Runtime setup adapted from ChatStage (MIT), Copyright 2026 ChatStage contributors.
export async function loadPiper(onProgress = () => {}) {
  const [{ PiperPlus }, ort] = await Promise.all([
    import("piper-plus"),
    import("onnxruntime-web"),
  ]);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths =
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
  return PiperPlus.initialize({
    model:
      "https://huggingface.co/ayousanz/piper-plus-css10-ja-6lang/resolve/bd0d812d4db9182ecdb907ef074becf9e230c17f/css10-ja-6lang-fp16.onnx",
    ort,
    wasmG2pUrl:
      "https://unpkg.com/piper-plus@0.8.2/dist/rust-wasm/piper_plus_wasm.js",
    onProgress,
  });
}

export class SpeechOutput {
  constructor(onStatus = () => {}, loader = loadPiper) {
    this.onStatus = onStatus;
    this.loader = loader;
    this.enabled = true;
    this.epoch = 0;
    this.engine = null;
  }
  unlock() {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (Context) {
      this.context ??= new Context();
      this.context.resume().catch(() => {});
    }
  }
  async enableNeural() {
    this.unlock();
    this.loading ??= this.loader((info) => this.onStatus("loading", info))
      .then((engine) => {
        this.engine = engine;
        return engine;
      })
      .catch((error) => {
        this.loading = null;
        throw error;
      });
    await this.loading;
    this.onStatus("ready");
  }
  stop() {
    this.epoch++;
    try {
      this.source?.stop();
    } catch {
      /* An ended source is already silent. */
    }
    this.source = null;
    globalThis.speechSynthesis?.cancel();
  }
  async synthesize(text, language) {
    if (!this.engine) throw new Error("Neural voice is not loaded.");
    // Serialize inference; an older readback may still be finishing after Stop.
    const work = (this.queue ?? Promise.resolve()).then(() =>
      this.engine.synthesize(text, {
        language,
        lengthScale: 1.1,
        noiseScale: 0.4,
        noiseW: 0.5,
        ssml: false,
      }),
    );
    this.queue = work.catch(() => {});
    const audio = await work;
    if (
      !(audio.samples instanceof Float32Array) ||
      !audio.samples.length ||
      !audio.samples.every(Number.isFinite) ||
      !(audio.sampleRate > 0)
    )
      throw new Error("Neural voice returned invalid audio.");
    return audio;
  }
  async say(text, language) {
    this.stop();
    if (!this.enabled || !text) return;
    const epoch = this.epoch;
    if (this.engine && this.context) {
      try {
        this.onStatus("speaking");
        const audio = await this.synthesize(text, language);
        if (epoch !== this.epoch || !this.enabled) return;
        const buffer = this.context.createBuffer(
          1,
          audio.samples.length,
          audio.sampleRate,
        );
        buffer.copyToChannel(audio.samples, 0);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        this.source = source;
        source.onended = () => {
          source.disconnect();
          if (this.source === source) this.source = null;
          if (epoch === this.epoch) this.onStatus("ready");
        };
        source.start();
        return;
      } catch {
        if (epoch !== this.epoch) return;
        this.onStatus("fallback");
      }
    }
    if (epoch !== this.epoch) return;
    if (globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === "ja" ? "ja-JP" : "en-US";
      utterance.rate = 0.9;
      utterance.onerror = () => this.onStatus("captions");
      speechSynthesis.speak(utterance);
    } else this.onStatus("captions");
  }
}

export class SpeechInput {
  constructor({ onText, onState, onError, beforeListen }) {
    Object.assign(this, { onText, onState, onError, beforeListen });
    this.active = false;
  }
  get supported() {
    return Boolean(
      globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
    );
  }
  start(language) {
    if (this.active) {
      this.stop();
      return;
    }
    const Recognition =
      globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
    if (!Recognition) {
      this.onError("unsupported");
      return;
    }
    this.beforeListen();
    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = language === "ja" ? "ja-JP" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (this.recognition === recognition) {
        this.active = true;
        this.onState(true);
      }
    };
    recognition.onend = () => {
      if (this.recognition === recognition) {
        this.active = false;
        this.onState(false);
      }
    };
    recognition.onerror = (event) => {
      if (this.recognition === recognition) this.onError(event.error);
    };
    recognition.onresult = (event) => {
      if (this.recognition !== recognition || !this.active) return;
      const text = event.results[event.resultIndex]?.[0]?.transcript;
      if (text) this.onText(text);
    };
    try {
      this.active = true;
      this.onState(true);
      recognition.start();
    } catch {
      this.active = false;
      this.onState(false);
      this.onError("audio-capture");
    }
  }
  stop() {
    const old = this.recognition;
    this.recognition = null;
    old?.abort();
    this.active = false;
    this.onState(false);
  }
}
