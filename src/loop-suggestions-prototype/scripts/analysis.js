/**
 * Prototype MIR heuristics. No learned models or third-party runtime dependencies.
 * Beat phase and four-beat bars are guesses; scores rank candidates, not confidence.
 */
const FFT_SIZE = 2048;
const HOP = 512;
const BANDS = 24;

/**
 * Calculate a real signal's FFT magnitudes, using an in-place radix-2 transform.
 */
function spectrum(samples, offset, window, real, imaginary) {
  const size = real.length;
  for (let i = 0; i < size; i++) {
    real[i] = (samples[offset + i] || 0) * window[i];
    imaginary[i] = 0;
  }
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let base = 0; base < size; base += length) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < length / 2; j++) {
        const even = base + j;
        const odd = even + length / 2;
        const tr = wr * real[odd] - wi * imaginary[odd];
        const ti = wr * imaginary[odd] + wi * real[odd];
        real[odd] = real[even] - tr;
        imaginary[odd] = imaginary[even] - ti;
        real[even] += tr;
        imaginary[even] += ti;
        const nextWr = wr * stepReal - wi * stepImaginary;
        wi = wr * stepImaginary + wi * stepReal;
        wr = nextWr;
      }
    }
  }
}

/**
 * Extract spectral bands, pitch classes, RMS, and positive spectral flux.
 * Frames are centred on their timestamps so comparisons straddle the join.
 */
function extractFeatures(samples, sampleRate, progress) {
  const count = Math.ceil(samples.length / HOP);
  const bands = new Float32Array(count * BANDS);
  const chroma = new Float32Array(count * 12);
  const rms = new Float32Array(count);
  const flux = new Float32Array(count);
  const real = new Float64Array(FFT_SIZE);
  const imaginary = new Float64Array(FFT_SIZE);
  const previous = new Float64Array(FFT_SIZE / 2);
  const window = Float64Array.from({ length: FFT_SIZE }, (_, i) =>
    0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
  const bandBins = new Int16Array(FFT_SIZE / 2).fill(-1);
  const pitchBins = new Int16Array(FFT_SIZE / 2).fill(-1);
  for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
    const hz = bin * sampleRate / FFT_SIZE;
    if (hz >= 55 && hz <= 5000) {
      bandBins[bin] = Math.min(BANDS - 1, Math.floor(Math.log(hz / 55) / Math.log(5000 / 55) * BANDS));
    }
    if (hz >= 65 && hz <= 2000) {
      pitchBins[bin] = ((Math.round(69 + 12 * Math.log2(hz / 440)) % 12) + 12) % 12;
    }
  }
  for (let frame = 0; frame < count; frame++) {
    const centre = frame * HOP;
    spectrum(samples, centre - FFT_SIZE / 2, window, real, imaginary);
    let energy = 0;
    let used = 0;
    for (let i = Math.max(0, centre - HOP / 2); i < Math.min(samples.length, centre + HOP / 2); i++) {
      energy += samples[i] * samples[i];
      used++;
    }
    rms[frame] = Math.sqrt(energy / Math.max(1, used));
    for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
      const magnitude = Math.hypot(real[bin], imaginary[bin]);
      flux[frame] += Math.max(0, magnitude - previous[bin]);
      previous[bin] = magnitude;
      if (bandBins[bin] >= 0) {
        bands[frame * BANDS + bandBins[bin]] += magnitude;
      }
      if (pitchBins[bin] >= 0) {
        chroma[frame * 12 + pitchBins[bin]] += magnitude;
      }
    }
    if (frame % 300 === 0) {
      progress(`Reading tone and rhythm: ${Math.round(frame / count * 100)}%`);
    }
  }
  return { bands, chroma, rms, flux, step: HOP / sampleRate, count };
}

/**
 * Normalized positive correlation; a flat envelope supplies no rhythm evidence.
 */
function correlation(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - meanA;
    const y = b[i] - meanB;
    numerator += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa * bb > 1e-12 ? Math.max(0, numerator / Math.sqrt(aa * bb)) : 0;
}

/**
 * Estimate a global beat period by onset autocorrelation in the 70–180 BPM range.
 * Refinement considers a complete beat grid rather than accumulating rounded lags.
 */
function estimateGrid(features, overrideBpm) {
  const { flux, step, count } = features;
  const mean = flux.reduce((sum, value) => sum + value, 0) / count;
  const onsets = Float32Array.from(flux, value => Math.max(0, value - mean * 0.6));
  let period = 60 / (overrideBpm || 120);
  let strength = 0;
  if (!overrideBpm) {
    let best = -Infinity;
    for (let lag = Math.ceil(60 / 180 / step); lag <= Math.floor(60 / 70 / step); lag++) {
      let product = 0;
      let powerA = 0;
      let powerB = 0;
      for (let i = lag; i < count; i++) {
        product += onsets[i] * onsets[i - lag];
        powerA += onsets[i] ** 2;
        powerB += onsets[i - lag] ** 2;
      }
      const value = product / Math.max(1e-12, Math.sqrt(powerA * powerB));
      // Mild preference for the midrange resolves some half/double-tempo ties.
      const weighted = value * (1 - 0.08 * Math.abs(Math.log2(60 / (lag * step) / 110)));
      if (weighted > best) {
        best = weighted;
        strength = value;
        period = lag * step;
      }
    }
  }
  const initialPeriod = period;
  let phase = 0;
  let bestAlignment = -Infinity;
  const refinements = overrideBpm ? [0] : Array.from({ length: 25 }, (_, i) => (i - 12) / 400);
  for (const adjustment of refinements) {
    const candidatePeriod = initialPeriod * (1 + adjustment);
    for (let offset = 0; offset < candidatePeriod; offset += step / 2) {
      let total = 0;
      let beats = 0;
      for (let time = offset; time < count * step; time += candidatePeriod) {
        const index = Math.round(time / step);
        total += onsets[index] || 0;
        beats++;
      }
      const alignment = total / Math.max(1, beats);
      if (alignment > bestAlignment) {
        bestAlignment = alignment;
        period = candidatePeriod;
        phase = offset;
      }
    }
  }
  // The strongest of four beat phases is only a downbeat hypothesis.
  let barPhase = 0;
  let strongest = -Infinity;
  for (let offset = 0; offset < 4; offset++) {
    let total = 0;
    let beats = 0;
    for (let time = phase + offset * period; time < count * step; time += period * 4) {
      total += onsets[Math.round(time / step)] || 0;
      beats++;
    }
    if (total / Math.max(1, beats) > strongest) {
      strongest = total / Math.max(1, beats);
      barPhase = offset;
    }
  }
  return { bpm: 60 / period, period, phase: phase + barPhase * period, strength, onsets };
}

/**
 * Average features within a window, preserving the pitch/spectrum distribution.
 */
function vectorAt(data, width, time, seconds, features) {
  const first = Math.max(0, Math.floor((time - seconds / 2) / features.step));
  const last = Math.min(features.count, Math.ceil((time + seconds / 2) / features.step));
  const result = new Float64Array(width);
  for (let frame = first; frame < last; frame++) {
    for (let bin = 0; bin < width; bin++) {
      result[bin] += data[frame * width + bin];
    }
  }
  return result;
}

/**
 * Compare normalized distributions using square-root overlap (0–1).
 */
function similarity(a, b) {
  const totalA = a.reduce((sum, value) => sum + value, 0);
  const totalB = b.reduce((sum, value) => sum + value, 0);
  if (totalA <= 1e-12 || totalB <= 1e-12) {
    return 0;
  }
  let value = 0;
  for (let i = 0; i < a.length; i++) {
    value += Math.sqrt(a[i] / totalA * b[i] / totalB);
  }
  return value;
}

/**
 * Sample a short rhythm envelope on both sides of a potential splice boundary.
 */
function envelopeAt(data, time, period, features) {
  return Array.from({ length: 48 }, (_, i) => {
    const position = (time + (i / 47 * 4 - 2) * period) / features.step;
    const index = Math.max(0, Math.min(features.count - 1, Math.round(position)));
    return data[index];
  });
}

/**
 * Match the context before AND after both boundaries, rejecting silence/fades.
 */
function scoreCandidate(start, end, bars, features, grid, peakRms) {
  let harmony = 0;
  let tone = 0;
  for (const direction of [-1, 1]) {
    const offset = direction * grid.period;
    harmony += similarity(
      vectorAt(features.chroma, 12, start + offset, grid.period * 2, features),
      vectorAt(features.chroma, 12, end + offset, grid.period * 2, features)) / 2;
    tone += similarity(
      vectorAt(features.bands, BANDS, start + offset, grid.period * 2, features),
      vectorAt(features.bands, BANDS, end + offset, grid.period * 2, features)) / 2;
  }
  const head = envelopeAt(features.rms, start, grid.period, features);
  const tail = envelopeAt(features.rms, end, grid.period, features);
  const headLevel = head.reduce((sum, value) => sum + value, 0) / head.length;
  const tailLevel = tail.reduce((sum, value) => sum + value, 0) / tail.length;
  const loudness = Math.min(headLevel, tailLevel) / Math.max(1e-9, headLevel, tailLevel);
  const rhythm = correlation(
    envelopeAt(grid.onsets, start, grid.period, features),
    envelopeAt(grid.onsets, end, grid.period, features));
  const first = Math.floor(start / features.step);
  const last = Math.min(features.count, Math.ceil(end / features.step));
  let quiet = 0;
  let level = 0;
  for (let i = first; i < last; i++) {
    level += features.rms[i];
    if (features.rms[i] < peakRms * 0.025) {
      quiet++;
    }
  }
  if (Math.min(headLevel, tailLevel) < peakRms * 0.04 || quiet / (last - first) > 0.15) {
    return null;
  }
  // Sustained changes across the region make an otherwise similar join less useful.
  const quarter = Math.max(1, Math.floor((last - first) / 4));
  let early = 0;
  let late = 0;
  for (let i = 0; i < quarter; i++) {
    early += features.rms[first + i];
    late += features.rms[last - 1 - i];
  }
  const stability = Math.min(early, late) / Math.max(1e-9, early, late);
  const score = 0.3 * harmony + 0.25 * tone + 0.25 * rhythm + 0.2 * loudness - 0.15 * (1 - stability);
  return { start, end, bars, score, harmony, tone, rhythm, loudness, stability,
    level: level / Math.max(1, last - first) };
}

/**
 * Extract a compact waveform for the UI; raw audio is not cached.
 */
function waveform(samples) {
  const peaks = [];
  const stride = Math.ceil(samples.length / 360);
  for (let start = 0; start < samples.length; start += stride) {
    let peak = 0;
    for (let i = start; i < Math.min(samples.length, start + stride); i++) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    peaks.push(peak);
  }
  return peaks;
}

/**
 * Find up to five distinct phrase-length loop candidates in a complete track.
 * @param {Float32Array} samples One decoded audio channel, normally at 11025 Hz.
 * @param {number} sampleRate Sample rate in Hz.
 * @param {number|null} overrideBpm Optional exact tempo; bar phase is still inferred.
 * @param {Function} progress Worker progress callback.
 * @returns {object} Ranked regions, tempo hypothesis, and waveform peaks.
 */
export function analyse(samples, sampleRate, overrideBpm = null, progress = () => {}) {
  const duration = samples.length / sampleRate;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || duration < 12 || duration > 900) {
    throw new Error("Choose a track between 12 seconds and 15 minutes long.");
  }
  if (overrideBpm !== null && (!Number.isFinite(overrideBpm) || overrideBpm < 40 || overrideBpm > 240)) {
    throw new Error("BPM must be between 40 and 240, or left empty for automatic estimation.");
  }
  const features = extractFeatures(samples, sampleRate, progress);
  const peakRms = features.rms.reduce((peak, value) => Math.max(peak, value), 0);
  const peaks = waveform(samples);
  if (peakRms < 1e-5) {
    return { duration, peaks, candidates: [], bpm: null, weakBeat: true, searched: 0 };
  }
  progress("Estimating tempo and bar alignment…");
  const grid = estimateGrid(features, overrideBpm);
  progress("Comparing phrase boundaries…");
  const candidates = [];
  let searched = 0;
  const bar = grid.period * 4;
  // Keep two beats of real context either side of the proposed join.
  for (let start = grid.phase; start < duration; start += bar) {
    if (start < grid.period * 2) {
      continue;
    }
    for (const bars of [4, 8, 16]) {
      const end = start + bars * bar;
      if (end > duration - grid.period * 2) {
        continue;
      }
      searched++;
      const candidate = scoreCandidate(start, end, bars, features, grid, peakRms);
      if (candidate && candidate.score >= 0.62) {
        candidates.push(candidate);
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const distinct = [];
  for (const candidate of candidates) {
    const duplicate = distinct.some(other => {
      const overlap = Math.max(0, Math.min(candidate.end, other.end) - Math.max(candidate.start, other.start));
      const union = Math.max(candidate.end, other.end) - Math.min(candidate.start, other.start);
      return overlap / union > 0.65;
    });
    if (!duplicate) {
      distinct.push(candidate);
    }
    if (distinct.length === 5) {
      break;
    }
  }
  return { duration, peaks, bpm: grid.bpm, weakBeat: !overrideBpm && grid.strength < 0.15,
    candidates: distinct, searched };
}
