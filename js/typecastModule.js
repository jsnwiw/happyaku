// typecastModule.js
// ES‑module that wraps the @neosapience/typecast-js SDK for browser usage.
// It loads the Typecast API key from config/apiKeys.json (the same file used by TTS).
// The module exposes three async helpers:
//   - init()        : loads the key and creates a client (called automatically).
//   - textToSpeech(text, options) : returns the raw audio object from the SDK.
//   - speak(text, options)        : synthesize and play the audio in the browser.

import { TypecastClient } from "https://unpkg.com/@neosapience/typecast-js/dist/index.esm.js";

let client = null; // cached client instance
let apiKey = null;

/** Load the API key from the JSON configuration file. */
async function loadApiKey() {
  if (apiKey) return apiKey;
  try {
    const resp = await fetch("config/apiKeys.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const cfg = await resp.json();
    apiKey = cfg.typecast || "";
  } catch (e) {
    console.warn("Failed to load Typecast API key:", e);
    apiKey = "";
  }
  return apiKey;
}

/** Initialise the Typecast client – called automatically on first use. */
async function init() {
  if (client) return client;
  const key = await loadApiKey();
  if (!key) {
    throw new Error(
      "Typecast API key not found. Add it to config/apiKeys.json under the \"typecast\" field."
    );
  }
  client = new TypecastClient({ apiKey: key });
  return client;
}

/** Convert text to speech using the SDK. Returns the SDK audio object. */
export async function textToSpeech(text, options = {}) {
  const tc = await init();
  const defaultOpts = {
    text,
    model: "ssfm-v30",
    // Replace with a valid voice ID for your account.
    voice_id: "tc_672c5f5ce59fac2a48faeaee",
  };
  const payload = { ...defaultOpts, ...options };
  return await tc.textToSpeech(payload);
}

/** Convenience helper – synthesize and play the audio directly in the browser. */
export async function speak(text, options = {}) {
  const audio = await textToSpeech(text, options);
  const blob = new Blob([audio.audioData], { type: `audio/${audio.format}` });
  const url = URL.createObjectURL(blob);
  const el = new Audio(url);
  el.play();
  el.onended = () => URL.revokeObjectURL(url);
}

// Export init in case callers need to ensure the client is ready.
export { init };
