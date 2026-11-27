// Tap-to-record bookkeeping. Pure JS, same idea as session-drummer's listener:
// keep a short pre-roll before the first note, stop on silence or a hard maximum.
// The mic graph itself lives in engine.js and is only open while a take is running.

export const TAKE_MAX_SEC = 60;
export const TAKE_PREROLL_SEC = 0.35;
export const TAKE_TAIL_SEC = 0.4;
export const TAKE_STOP_SEC = 1.8;
export const TAKE_START_RMS = 0.015;

export function createTakeRecorder(sampleRate, opts) {
  const o = Object.assign({
    preroll: TAKE_PREROLL_SEC,
    tail: TAKE_TAIL_SEC,
    stopSec: TAKE_STOP_SEC,
    maxSec: TAKE_MAX_SEC,
    startRms: TAKE_START_RMS,
  }, opts || {});
  const chunks = [];
  let count = 0;
  let heard = false;
  let lastLoud = 0;
  let level = 0;
  return {
    get level() { return level; },
    get samples() { return count; },
    get heard() { return heard; },
    push(frame) {
      const copy = new Float32Array(frame.length);
      let acc = 0;
      for (let i = 0; i < frame.length; i++) {
        const x = Number.isFinite(frame[i]) ? frame[i] : 0;
        copy[i] = x;
        acc += x * x;
      }
      chunks.push(copy);
      const rms = Math.sqrt(acc / Math.max(1, copy.length));
      level = rms;
      if (rms >= o.startRms) {
        heard = true;
        lastLoud = count + copy.length;
      }
      count += copy.length;
      if (count >= o.maxSec * sampleRate) return "max";
      if (heard && (count - lastLoud) / sampleRate >= o.stopSec) return "silence";
      return null;
    },
    finish(reason) {
      const all = new Float32Array(count);
      let at = 0;
      for (let i = 0; i < chunks.length; i++) {
        all.set(chunks[i], at);
        at += chunks[i].length;
      }
      const trimmed = trimTake(all, sampleRate, o);
      const seconds = trimmed.audio.length / sampleRate;
      return {
        reason: reason || "tap",
        sampleRate,
        samples: trimmed.audio,
        trimStart: 0,
        trimEnd: seconds,
        heard,
        lead: trimmed.lead,
        loop: true,
      };
    },
  };
}

export function trimTake(samples, sampleRate, opts) {
  const o = Object.assign({
    preroll: TAKE_PREROLL_SEC,
    tail: TAKE_TAIL_SEC,
    startRms: TAKE_START_RMS,
  }, opts || {});
  const n = samples.length;
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i += hop) {
    const end = Math.min(n, i + hop);
    let acc = 0;
    for (let j = i; j < end; j++) acc += samples[j] * samples[j];
    const rms = Math.sqrt(acc / (end - i));
    if (rms >= o.startRms) {
      if (first < 0) first = i;
      last = end;
    }
  }
  if (first < 0) {
    const keep = Math.min(n, Math.round(sampleRate * 1));
    return { audio: samples.slice(0, keep), lead: 0 };
  }
  const start = Math.max(0, first - Math.round(o.preroll * sampleRate));
  const end = Math.min(n, last + Math.round(o.tail * sampleRate));
  return { audio: samples.slice(start, Math.max(end, start)), lead: (first - start) / sampleRate };
}

export function sliceTake(samples, sampleRate, startSec, endSec) {
  const n = samples.length;
  const span = n / sampleRate;
  let a = Math.round(Math.max(0, startSec) * sampleRate);
  let b = Math.round(Math.min(span, endSec) * sampleRate);
  if (b < a + 8) b = Math.min(n, a + 8);
  if (a > n - 8) a = Math.max(0, n - 8);
  return samples.slice(a, b);
}

export function resampleLinear(samples, fromRate, toRate) {
  if (!(toRate > 0) || fromRate === toRate) return samples;
  const n = Math.max(1, Math.round(samples.length * toRate / fromRate));
  const out = new Float32Array(n);
  const scale = samples.length <= 1 ? 0 : (samples.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * scale;
    const i0 = Math.floor(x);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const f = x - i0;
    out[i] = samples[i0] * (1 - f) + samples[i1] * f;
  }
  return out;
}
