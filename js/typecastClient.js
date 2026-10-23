// typecastClient.js
// Wrapper around the @neosapience/typecast-js SDK for browser usage.
// It reads the API key from the config file via the existing TTS module.

import { TypecastClient } from "https://unpkg.com/@neosapience/typecast-js/dist/index.esm.js";

/**
 * Create a Typecast client using the stored API key.
 * Returns a Promise that resolves to the instantiated client.
 */
async function createClient() {
  // TTS module already provides a method to fetch the Typecast key.
  const apiKey = await window.TTS.getTypecastKey();
  if (!apiKey) {
    throw new Error("Typecast API key not configured. Update config/apiKeys.json.");
  }
  return new TypecastClient({ apiKey });
}

/**
 * Convert `text` to speech and return the raw audio data (Uint8Array).
 * Options can include model, voice_id, and other SDK parameters.
 */
export async function textToSpeech(text, options = {}) {
  const client = await createClient();
  const defaultOpts = {
    text,
    model: "ssfm-v30",
    // You must replace with a valid voice ID; a placeholder is used here.
    voice_id: "tc_672c5f5ce59fac2a48faeaee",
  };
  const payload = { ...defaultOpts, ...options };
  const audio = await client.textToSpeech(payload);
  // `audio` contains { audioData: Uint8Array, format: string, duration: number, ... }
  return audio;
}

/**
 * Convenience helper: synthesize and play the audio directly in the browser.
 */
export async function speak(text, options = {}) {
  const audio = await textToSpeech(text, options);
  const blob = new Blob([audio.audioData], { type: `audio/${audio.format}` });
  const url = URL.createObjectURL(blob);
  const audioEl = new Audio(url);
  audioEl.play();
  // Clean up after playback.
  audioEl.onended = () => {
    URL.revokeObjectURL(url);
  };
}
