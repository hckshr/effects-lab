import test from "node:test";
import assert from "node:assert/strict";
import { ReverbCore, DELAYS_48K, fillDelaySamples, loopGainForDelay, MAX_REVERB_LOOP } from "../src/reverb-core.js";
import { createEnvelopeFollower } from "../src/envelope-core.js";

function rms(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

function render(type, controls, seconds) {
  const sr = 48000;
  const rev = new ReverbCore(sr);
  rev.setControls({
    t60: 1.6,
    cutoff: 4500,
    predelay: 0.02,
    width: 1,
    mod: 0.35,
    size: 1,
    type,
    ...controls,
  });
  const n = Math.floor(sr * seconds);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const block = 128;
  const input = new Float32Array(block);
  input[0] = 1;
  for (let i = 0; i < n; i += block) {
    const len = Math.min(block, n - i);
    rev.process(input.subarray(0, len), L.subarray(i, i + len), R.subarray(i, i + len));
    if (i === 0) input[0] = 0;
  }
  return { L, R, sr };
}

function stats(buf) {
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  let bad = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    if (!Number.isFinite(x)) bad++;
    const a = Math.abs(x);
    if (a > peak) peak = a;
    if (a > 1.95) clipped++;
    sum += x;
  }
  return { peak, mean: sum / buf.length, clipped: clipped / buf.length, bad };
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  sa /= n;
  sb /= n;
  let sab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - sa;
    const db = b[i] - sb;
    sab += da * db;
    aa += da * da;
    bb += db * db;
  }
  return sab / Math.sqrt(aa * bb);
}

function fftMag(frame) {
  const n = frame.length;
  const re = Float64Array.from(frame);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vIm = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const next = wr * wlenRe - wi * wlenIm;
        wi = wr * wlenIm + wi * wlenRe;
        wr = next;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

function spectralCrest(samples, sr) {
  const n = 1024;
  const start = Math.floor(sr * 0.55);
  const frame = samples.subarray(start, start + n);
  const windowed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    windowed[i] = frame[i] * w;
  }
  const mag = fftMag(windowed);
  const lo = Math.max(1, Math.floor((80 * n) / sr));
  const hi = Math.min(mag.length - 1, Math.floor((8000 * n) / sr));
  let max = 0;
  let mean = 0;
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    if (mag[i] > max) max = mag[i];
    mean += mag[i];
    count++;
  }
  mean /= count;
  return mean > 0 ? max / mean : Infinity;
}

function nearHarmonic(delays) {
  for (let i = 0; i < delays.length; i++) {
    for (let j = i + 1; j < delays.length; j++) {
      const ratio = Math.max(delays[i], delays[j]) / Math.min(delays[i], delays[j]);
      for (const frac of [1.5, 2, 2.5, 3, 4]) {
        if (Math.abs(ratio - frac) / frac < 0.012) return ratio;
      }
    }
  }
  return 0;
}

test("delay sets avoid tight harmonic ratios and loop gain stays capped", () => {
  for (const type of Object.keys(DELAYS_48K)) {
    for (const size of [0.7, 1, 1.35]) {
      const delays = fillDelaySamples(type, size, 48000, new Float64Array(8));
      assert.equal(nearHarmonic(delays), 0, type + " " + size);
      for (const samples of delays) {
        const g = loopGainForDelay(samples, 48000, 8);
        assert.ok(g > 0 && g <= MAX_REVERB_LOOP);
        assert.ok(loopGainForDelay(samples, 48000, 0.3) < g);
      }
    }
  }
});

test("reverb tails decay, stay finite, and are not a single metallic peak", () => {
  for (const type of ["room", "hall", "spring", "plate"]) {
    const { L, R, sr } = render(type, { t60: 1.7, width: 1, mod: type === "spring" ? 0.7 : 0.3 }, 3);
    const left = stats(L);
    const early = rms(L.subarray(Math.floor(sr * 0.2), Math.floor(sr * 0.45)));
    const late = rms(L.subarray(Math.floor(sr * 2.15), Math.floor(sr * 2.6)));
    const crest = spectralCrest(L, sr);
    const corr = correlation(L.subarray(sr * 0.4, sr * 1.2), R.subarray(sr * 0.4, sr * 1.2));
    assert.equal(left.bad, 0, type);
    assert.ok(left.peak > 0.02 && left.peak < 2.01, type + " peak " + left.peak);
    assert.ok(left.clipped < 0.002, type + " clipped " + left.clipped);
    assert.ok(Math.abs(left.mean) < 0.02, type + " dc " + left.mean);
    assert.ok(early > late * 2, type + " early " + early + " late " + late);
    assert.ok(early > 0.005, type + " early " + early);
    assert.ok(crest < 40, type + " crest " + crest);
    assert.ok(Math.abs(corr) < 0.92, type + " corr " + corr);
  }
});

test("a loud burst does not explode the tank", () => {
  const sr = 48000;
  const rev = new ReverbCore(sr);
  rev.setControls({ t60: 6, cutoff: 8000, predelay: 0, width: 1, mod: 0.2, size: 1.2, type: "hall" });
  const n = sr;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const block = 128;
  const input = new Float32Array(block);
  for (let i = 0; i < n; i += block) {
    input.fill(0);
    if (i < sr * 0.05) input.fill(0.4);
    const len = Math.min(block, n - i);
    rev.process(input.subarray(0, len), L.subarray(i, i + len), R.subarray(i, i + len));
  }
  const info = stats(L);
  assert.equal(info.bad, 0);
  assert.ok(info.peak < 2.01);
  assert.ok(info.clipped < 0.05);
});

test("envelope follower rises on a note and falls after it", () => {
  const sr = 48000;
  const env = createEnvelopeFollower(sr);
  const n = 4800;
  const input = new Float32Array(n);
  const output = new Float32Array(n);
  for (let i = 0; i < 800; i++) input[i] = 0.5;
  env.process(input, output, 0.005, 0.05, 1, 1000);
  assert.ok(output[400] > 200);
  assert.ok(output[n - 1] < output[900]);
  const silent = new Float32Array(n);
  const out2 = new Float32Array(n);
  env.reset();
  env.process(silent, out2, 0.005, 0.05, 1, 1000);
  assert.ok(out2[n - 1] < 1);
});
