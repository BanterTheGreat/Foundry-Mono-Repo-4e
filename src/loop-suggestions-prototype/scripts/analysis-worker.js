import { analyse } from "./analysis.js";

/**
 * Keep spectral work off Foundry's UI thread. Closing the sheet terminates this worker.
 */
self.onmessage = ({ data }) => {
  try {
    const result = analyse(data.samples, data.sampleRate, data.bpm,
      message => self.postMessage({ type: "progress", message }));
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
