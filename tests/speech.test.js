import test from "node:test";
import assert from "node:assert/strict";
import { SpeechInput, SpeechOutput } from "../src/speech.js";

test("Piper initialization retries after failure and synth disables SSML", async () => {
  let calls = 0,
    options;
  const voice = new SpeechOutput(
    () => {},
    async () => {
      if (++calls === 1) throw new Error("offline");
      return {
        synthesize: async (_text, opts) => {
          options = opts;
          return { samples: new Float32Array([0.1, 0.2]), sampleRate: 22050 };
        },
      };
    },
  );
  await assert.rejects(() => voice.enableNeural());
  await voice.enableNeural();
  await voice.enableNeural();
  assert.equal(calls, 2);
  await voice.synthesize("<speak>test</speak>", "ja");
  assert.equal(options.ssml, false);
  assert.equal(options.language, "ja");
});
test("invalid neural audio is rejected", async () => {
  const voice = new SpeechOutput();
  voice.engine = {
    synthesize: async () => ({
      samples: new Float32Array([NaN]),
      sampleRate: 22050,
    }),
  };
  await assert.rejects(() => voice.synthesize("test", "en"), /invalid audio/);
});
test("neural inference is serialized across interrupted readbacks", async () => {
  let active = 0,
    maximum = 0;
  const voice = new SpeechOutput();
  voice.engine = {
    synthesize: async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { samples: new Float32Array([0.1]), sampleRate: 22050 };
    },
  };
  await Promise.all([
    voice.synthesize("first", "en"),
    voice.synthesize("second", "ja"),
  ]);
  assert.equal(maximum, 1);
});
test("microphone language, denied permission and final transcript handling", (t) => {
  const old = globalThis.SpeechRecognition;
  t.after(() => {
    globalThis.SpeechRecognition = old;
  });
  let instance, transcript, error, active;
  globalThis.SpeechRecognition = class {
    constructor() {
      instance = this;
    }
    start() {
      this.onstart();
    }
    abort() {
      this.onend();
    }
  };
  const input = new SpeechInput({
    onText: (text) => (transcript = text),
    onError: (code) => (error = code),
    onState: (value) => (active = value),
    beforeListen() {},
  });
  input.start("en");
  assert.equal(instance.lang, "en-US");
  assert.equal(active, true);
  instance.onresult({
    resultIndex: 0,
    results: [[{ transcript: "two coffees" }]],
  });
  assert.equal(transcript, "two coffees");
  instance.onerror({ error: "not-allowed" });
  assert.equal(error, "not-allowed");
  input.stop();
  assert.equal(active, false);
  instance.onresult({
    resultIndex: 0,
    results: [[{ transcript: "late checkout" }]],
  });
  assert.equal(transcript, "two coffees");
});
