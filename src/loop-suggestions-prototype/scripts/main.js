const MODULE_ID = "loop-suggestions-prototype";
const panels = new WeakMap();
const results = new Map();

/**
 * Format timestamps with millisecond precision for Sound of Silence's time fields.
 */
function timestamp(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

/**
 * Read unsaved file selection too, so the hints always correspond to the editor.
 */
function sourcePath(app, element) {
  return element.querySelector('input[name="path"]')?.value?.trim() || app.document.path;
}

/**
 * Respect Foundry's route prefix for local assets, preserving absolute URLs.
 */
function sourceUrl(path) {
  if (/^https?:\/\//i.test(path) || path.startsWith("/")) {
    return path;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new Error("Choose a local audio file or an HTTP(S) audio URL.");
  }
  return foundry.utils.getRoute(path);
}

/**
 * Stop background work without touching Foundry or Sound of Silence audio.
 */
function dispose(state) {
  state.controller?.abort();
  state.worker?.terminate();
  state.worker = null;
}

/**
 * Run analysis in a cancellable module worker, transferring only our audio copy.
 */
function runWorker(state, samples, sampleRate, bpm) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./analysis-worker.js", import.meta.url), { type: "module" });
    state.worker = worker;
    const signal = state.controller.signal;
    const abort = () => finish(new DOMException("Analysis cancelled", "AbortError"));
    const finish = (error, result) => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      state.worker = null;
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        state.status.textContent = data.message;
      } else if (data.type === "result") {
        finish(null, data.result);
      } else if (data.type === "error") {
        finish(new Error(data.message));
      }
    };
    worker.onerror = event => {
      finish(new Error(event.message || "Could not start the analysis worker. Check the browser console."));
    };
    worker.postMessage({ samples, sampleRate, bpm }, [samples.buffer]);
  });
}

/**
 * Decode at a low analysis sample rate, then choose the more energetic channel.
 * Using a channel rather than summing stereo avoids cancellation in wide mixes.
 */
async function analyseTrack(state, path, bpm) {
  state.status.textContent = "Loading audio…";
  const response = await fetch(sourceUrl(path), { signal: state.controller.signal });
  if (!response.ok) {
    throw new Error(`Could not load the audio (HTTP ${response.status}).`);
  }
  const bytes = await response.arrayBuffer();
  state.controller.signal.throwIfAborted();
  state.status.textContent = "Decoding audio…";
  const decoder = new OfflineAudioContext(1, 1, 11025);
  const audio = await decoder.decodeAudioData(bytes);
  state.controller.signal.throwIfAborted();
  if (audio.duration < 12 || audio.duration > 900) {
    throw new Error("Choose a track between 12 seconds and 15 minutes long.");
  }
  let selectedChannel = 0;
  let highestEnergy = -1;
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    let energy = 0;
    for (let i = 0; i < samples.length; i += 97) {
      energy += samples[i] * samples[i];
    }
    if (energy > highestEnergy) {
      highestEnergy = energy;
      selectedChannel = channel;
    }
  }
  return runWorker(state, audio.getChannelData(selectedChannel).slice(), audio.sampleRate, bpm);
}

/**
 * Draw the entire waveform with a selected start/end pair overlaid.
 */
function drawWaveform(state, selected = 0) {
  const { duration, peaks, candidates } = state.result;
  const candidate = candidates[selected];
  const max = Math.max(0.0001, ...peaks);
  const points = peaks.map((peak, i) => `${i / Math.max(1, peaks.length - 1) * 1000},${40 - peak / max * 32}`);
  const bottom = peaks.map((peak, i) => `${i / Math.max(1, peaks.length - 1) * 1000},${40 + peak / max * 32}`).reverse();
  const start = candidate ? candidate.start / duration * 1000 : 0;
  const end = candidate ? candidate.end / duration * 1000 : 0;
  state.waveform.innerHTML = `<svg viewBox="0 0 1000 80" preserveAspectRatio="none" role="img" aria-label="Track waveform${candidate ? `, suggested loop ${timestamp(candidate.start)} to ${timestamp(candidate.end)}` : ""}">
    <polygon class="lsp-wave" points="${[...points, ...bottom].join(" ")}" />
    ${candidate ? `<rect class="lsp-region" x="${start}" y="0" width="${end - start}" height="80" />
    <path class="lsp-boundaries" d="M ${start} 0 V 80 M ${end} 0 V 80" />` : ""}
  </svg>`;
  state.root.querySelectorAll(".lsp-candidate").forEach((row, index) => {
    row.classList.toggle("lsp-selected", index === selected);
    row.querySelector(".lsp-select").setAttribute("aria-pressed", String(index === selected));
  });
}

/**
 * Explain the best-supported join properties without presenting a confidence %.
 */
function explanation(candidate) {
  const reasons = [];
  if (candidate.harmony >= 0.92) {
    reasons.push("similar harmony");
  }
  if (candidate.tone >= 0.92) {
    reasons.push("similar tone");
  }
  if (candidate.rhythm >= 0.55) {
    reasons.push("matching rhythm");
  }
  if (candidate.loudness >= 0.85) {
    reasons.push("even volume");
  }
  return reasons.length ? reasons.join(" · ") : "A possible join; listen carefully";
}

/**
 * Render independent visual hints. Read-only timestamps can be selected and copied.
 */
function showResult(state, result) {
  state.result = result;
  state.output.hidden = false;
  state.status.textContent = result.candidates.length
    ? `${result.candidates.length} suggestions · ${result.bpm.toFixed(1)} BPM ${state.bpm.value ? "provided" : "estimated"} · assumed 4/4`
    : "No convincing phrase joins found. Try providing the BPM, or choose another track.";
  state.root.querySelector(".lsp-warning").textContent = result.weakBeat
    ? "Weak beat estimate: these boundaries may drift. Try entering the track's BPM."
    : "Bar alignment is a guess. Use SoS's join preview to check the result, especially for vocals or changing tempos.";
  state.root.querySelector(".lsp-times").textContent = `00:00 — ${timestamp(result.duration)}`;
  state.list.replaceChildren();
  result.candidates.forEach((candidate, index) => {
    const row = document.createElement("div");
    row.className = "lsp-candidate";
    row.innerHTML = `<button type="button" class="lsp-select" aria-pressed="false">
        <span>${index + 1}. ${candidate.score >= 0.84 ? "Promising" : "Possible"} · ${candidate.bars} bars</span>
        <span class="lsp-lane"><span style="left:${candidate.start / result.duration * 100}%;width:${(candidate.end - candidate.start) / result.duration * 100}%"></span></span>
      </button>
      <div class="lsp-timestamps"><label>Start <input type="text" readonly aria-label="Suggested start" value="${timestamp(candidate.start)}"></label>
      <label>End <input type="text" readonly aria-label="Suggested end" value="${timestamp(candidate.end)}"></label></div>
      <p class="lsp-reasons">${explanation(candidate)}</p>`;
    row.querySelector("button").addEventListener("click", () => drawWaveform(state, index));
    row.querySelectorAll("input").forEach(input => input.addEventListener("click", () => input.select()));
    state.list.append(row);
  });
  state.root.querySelector(".lsp-diagnostics").textContent = JSON.stringify({
    algorithm: "phrase join heuristic v0.1", sampleRate: 11025, assumedMeter: "4/4",
    duration: result.duration, bpm: result.bpm, weakBeat: result.weakBeat,
    pairsCompared: result.searched, candidates: result.candidates,
  }, null, 2);
  drawWaveform(state);
}

/**
 * Attach after SoS's synchronous render hook. Fall back to a separate sheet section
 * if its editor selectors differ in the installed version.
 */
function attachPanel(app, element) {
  if (!game.user.isGM || !element) {
    return;
  }
  const previous = panels.get(app);
  if (previous) {
    dispose(previous);
    previous.root.remove();
  }
  const root = document.createElement("details");
  root.className = "lsp-panel";
  root.open = true;
  root.innerHTML = `<summary>Suggested loops <small>Prototype</small></summary>
    <p class="lsp-intro">Find repeating phrases, then copy the start/end times into Sound of Silence. Suggestions do not change your loops.</p>
    <div class="lsp-actions"><button type="button" class="lsp-analyse"><i class="fas fa-search" inert></i> Find suggested loops</button>
      <label>BPM <input class="lsp-bpm" type="number" min="40" max="240" step="0.1" placeholder="Auto" aria-label="Optional BPM override"></label>
      <button type="button" class="lsp-cancel" hidden>Cancel</button></div>
    <p class="lsp-status" role="status" aria-live="polite">Ready · browser analysis · tracks from 12 seconds to 15 minutes</p>
    <div class="lsp-output" hidden><div class="lsp-waveform"></div><div class="lsp-times"></div>
      <p class="lsp-warning"></p><div class="lsp-candidates"></div>
      <details class="lsp-debug"><summary>Analysis details</summary><pre class="lsp-diagnostics"></pre></details></div>`;
  const host = element.querySelector(".sos-sound-config");
  if (host) {
    host.prepend(root);
  } else {
    (element.querySelector("form") || element).append(root);
  }
  const state = {
    root, status: root.querySelector(".lsp-status"), bpm: root.querySelector(".lsp-bpm"),
    output: root.querySelector(".lsp-output"), waveform: root.querySelector(".lsp-waveform"),
    list: root.querySelector(".lsp-candidates"), controller: null, worker: null,
  };
  panels.set(app, state);
  const button = root.querySelector(".lsp-analyse");
  const cancel = root.querySelector(".lsp-cancel");
  const path = sourcePath(app, element);
  const cached = results.get(path);
  if (cached) {
    state.bpm.value = cached.overrideBpm ?? "";
    showResult(state, cached.result);
  }
  const invalidate = () => {
    dispose(state);
    state.output.hidden = true;
    state.status.textContent = "Track or BPM changed. Find suggestions again to update the markers.";
  };
  element.querySelector('input[name="path"]')?.addEventListener("change", invalidate);
  state.bpm.addEventListener("change", invalidate);
  cancel.addEventListener("click", () => dispose(state));
  button.addEventListener("click", async () => {
    const selectedPath = sourcePath(app, element);
    const bpm = state.bpm.value.trim() ? Number(state.bpm.value) : null;
    if (!selectedPath) {
      state.status.textContent = "Choose an audio file first.";
      return;
    }
    if (bpm !== null && (!Number.isFinite(bpm) || bpm < 40 || bpm > 240)) {
      state.status.textContent = "BPM must be between 40 and 240, or left empty for automatic estimation.";
      return;
    }
    state.controller = new AbortController();
    state.output.hidden = true;
    button.disabled = true;
    cancel.hidden = false;
    try {
      const result = await analyseTrack(state, selectedPath, bpm);
      state.controller.signal.throwIfAborted();
      results.delete(selectedPath);
      results.set(selectedPath, { overrideBpm: bpm, result });
      if (results.size > 10) {
        results.delete(results.keys().next().value);
      }
      showResult(state, result);
    } catch (error) {
      if (error.name === "AbortError") {
        state.status.textContent = "Analysis cancelled.";
      } else {
        console.error(`${MODULE_ID} | Audio analysis failed`, error);
        state.status.textContent = `Analysis failed: ${error.message} Remote audio must allow browser access (CORS).`;
      }
    } finally {
      button.disabled = false;
      cancel.hidden = true;
    }
  });
}

/**
 * Register a GM-only visual companion; no document writes or playback hooks.
 */
Hooks.once("ready", () => {
  Hooks.on("renderPlaylistSoundConfig", (app, html) => {
    const element = html instanceof HTMLElement ? html : html?.[0];
    queueMicrotask(() => attachPanel(app, element));
  });
  Hooks.on("closePlaylistSoundConfig", app => {
    const state = panels.get(app);
    if (state) {
      dispose(state);
      panels.delete(app);
    }
  });
});
