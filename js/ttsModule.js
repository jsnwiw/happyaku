// ttsModule.js
// This module encapsulates Text‑to‑Speech functionality and loads API keys
// from a JSON configuration file at runtime. **Do NOT commit real keys** –
// this file is only for demonstration. In production you should proxy API
// calls through a secure backend.

const TTS = (function () {
  // Private variable to cache loaded keys
  let apiKeys = null;

  /**
   * Load the JSON file that stores API keys.
   * Returns a promise that resolves to the parsed object.
   */
  async function loadApiKeys() {
    if (apiKeys) return apiKeys; // already loaded
    try {
      const response = await fetch('config/apiKeys.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      apiKeys = await response.json();
    } catch (e) {
      console.warn('Unable to load API keys:', e);
      apiKeys = {};
    }
    return apiKeys;
  }

  /** Retrieve the Typecast API key (or empty string if not set). */
  async function getTypecastKey() {
    const keys = await loadApiKeys();
    return keys.typecast || '';
  }

  /** Retrieve the Google TTS key (optional). */
  async function getGoogleTTSKey() {
    const keys = await loadApiKeys();
    return keys.googleTTS || '';
  }

  // Example placeholder init – replace with your existing UI logic.
  function init() {
    console.log('TTS module initialized');
    // You can now call getTypecastKey() wherever you need the key.
  }

  // Public API
  return {
    init,
    getTypecastKey,
    getGoogleTTSKey,
  };
})();

// Expose globally for existing code that expects window.TTS
window.TTS = TTS;
