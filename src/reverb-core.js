// Eight-delay FDN reverb. Unitary Hadamard mixing, input diffusion,
// early taps, and a short modulated comb when the type is spring.
// Loop gain is per-line from T60 and hard-capped so the tank cannot run away.

export const MAX_REVERB_LOOP = 0.95;

export const DELAYS_48K = {
  room: [983, 1109, 1249, 1409, 1597, 1801, 2039, 2297],
  hall: [1913, 2179, 2467, 2797, 3163, 3571, 4057, 4603],
  plate: [1399, 1567, 1777, 2017, 2287, 2579, 2917, 3319],
  spring: [677, 761, 857, 983, 1103, 1237, 1423, 1597],
};

const AP_48K = [149, 227, 383, 557];
const AP_GAIN = [0.7, 0.68, -0.62, 0.58];

const EARLY_MS = {
  room: [[11, 0.28], [17, 0.2], [29, 0.14], [41, 0.09]],
  hall: [[23, 0.26], [41, 0.18], [67, 0.12], [97, 0.08]],
  plate: [[13, 0.2], [19, 0.14], [31, 0.09]],
  spring: [[7, 0.16], [13, 0.1]],
};

export function loopGainForDelay(delaySamples, sampleRate, t60) {
  if (!(delaySamples > 0) || !(sampleRate > 0) || !(t60 > 0.01)) return 0;
  const seconds = delaySamples / sampleRate;
  const g = Math.pow(10, (-3 * seconds) / t60);
  if (!Number.isFinite(g) || g < 0) return 0;
  return Math.min(MAX_REVERB_LOOP, g);
}

export function fillDelaySamples(type, size, sampleRate, out) {
  const table = DELAYS_48K[type] || DELAYS_48K.room;
  const scale = (sampleRate / 48000) * size;
  for (let i = 0; i < 8; i++) out[i] = table[i] * scale;
  return out;
}

function hadamard8(v, out) {
  const s = 0.3535533905932738;
  const a = v[0], b = v[1], c = v[2], d = v[3], e = v[4], f = v[5], g = v[6], h = v[7];
  const a1 = a + b, b1 = a - b, c1 = c + d, d1 = c - d, e1 = e + f, f1 = e - f, g1 = g + h, h1 = g - h;
  const a2 = a1 + c1, c2 = a1 - c1, b2 = b1 + d1, d2 = b1 - d1, e2 = e1 + g1, g2 = e1 - g1, f2 = f1 + h1, h2 = f1 - h1;
  out[0] = (a2 + e2) * s;
  out[4] = (a2 - e2) * s;
  out[1] = (b2 + f2) * s;
  out[5] = (b2 - f2) * s;
  out[2] = (c2 + g2) * s;
  out[6] = (c2 - g2) * s;
  out[3] = (d2 + h2) * s;
  out[7] = (d2 - h2) * s;
}

class DelayLine {
  constructor(maxSamples) {
    this.max = maxSamples;
    this.buf = new Float32Array(maxSamples);
    this.w = 0;
  }
  clear() {
    this.buf.fill(0);
    this.w = 0;
  }
  write(x) {
    if (!Number.isFinite(x) || (x > -1e-30 && x < 1e-30)) x = 0;
    else if (x > 2) x = 2;
    else if (x < -2) x = -2;
    this.buf[this.w] = x;
    this.w++;
    if (this.w >= this.max) this.w = 0;
  }
  // Samples ago. Call before write() on this tick.
  read(delaySamples) {
    let d = delaySamples;
    if (!Number.isFinite(d)) return 0;
    if (d < 1) d = 1;
    if (d > this.max - 2) d = this.max - 2;
    let rp = this.w - d;
    if (rp < 0) rp += this.max;
    const i0 = rp | 0;
    const frac = rp - i0;
    const i1 = i0 + 1 >= this.max ? 0 : i0 + 1;
    const a = this.buf[i0];
    const b = this.buf[i1];
    return a + (b - a) * frac;
  }
}

class Allpass {
  constructor(maxSamples) {
    this.dl = new DelayLine(maxSamples);
  }
  clear() {
    this.dl.clear();
  }
  process(x, delay, g) {
    const d = this.dl.read(delay);
    const y = d - g * x;
    this.dl.write(x + g * y);
    return y;
  }
}

class Lowpass {
  constructor() {
    this.z = 0;
  }
  clear() {
    this.z = 0;
  }
  process(x, coeff) {
    this.z += coeff * (x - this.z);
    if (this.z > -1e-20 && this.z < 1e-20) this.z = 0;
    return this.z;
  }
}

class DCBlock {
  constructor() {
    this.x1 = 0;
    this.y1 = 0;
  }
  clear() {
    this.x1 = 0;
    this.y1 = 0;
  }
  process(x) {
    const y = x - this.x1 + 0.995 * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

export class ReverbCore {
  constructor(sampleRate) {
    this.sr = sampleRate;
    const scale = sampleRate / 48000;
    const lineMax = Math.ceil(5200 * scale * 1.7) + 8;
    this.lines = [];
    this.damp = [];
    for (let i = 0; i < 8; i++) {
      this.lines.push(new DelayLine(lineMax));
      this.damp.push(new Lowpass());
    }
    const apMax = Math.ceil(900 * scale) + 8;
    this.ap = AP_48K.map(() => new Allpass(apMax));
    this.apLen = AP_48K.map((n) => Math.max(2, Math.round(n * scale)));
    this.early = new DelayLine(Math.ceil(sampleRate * 0.45));
    this.drip = new DelayLine(Math.ceil(sampleRate * 0.08));
    this.dripLp = new Lowpass();
    this.dripBase = Math.max(2, Math.round(0.042 * sampleRate));
    this.dripMod = Math.max(1, Math.round(0.0035 * sampleRate));
    this.dcL = new DCBlock();
    this.dcR = new DCBlock();
    this.hpZ = 0;
    this.hpC = 1 - Math.exp((-2 * Math.PI * 42) / sampleRate);
    this.y = new Float64Array(8);
    this.mixed = new Float64Array(8);
    this.targetLen = new Float64Array(8);
    this.curLen = new Float64Array(8);
    this.smGain = new Float64Array(8);
    this.gainTarget = new Float64Array(8);
    this.taps = [];
    this.type = "";
    this.t60 = 1.4;
    this.cutoff = 4000;
    this.predelay = 0.02;
    this.width = 0.9;
    this.mod = 0.3;
    this.size = 1;
    this.preCur = 1;
    this.smDamp = 0.3;
    this.smWidth = 0.9;
    this.lfo = 0;
    this.lfoInc = 0.5 / sampleRate;
    this.ready = false;
    this.gainsReady = false;
    this.fdnTrim = 3.4;
    this.inject = 0.5;
    this.lpCoeff = 1 - Math.exp((-2 * Math.PI * 1600) / sampleRate);
  }

  clear() {
    for (let i = 0; i < 8; i++) {
      this.lines[i].clear();
      this.damp[i].clear();
      this.smGain[i] = 0;
    }
    for (let i = 0; i < this.ap.length; i++) this.ap[i].clear();
    this.early.clear();
    this.drip.clear();
    this.dripLp.clear();
    this.dcL.clear();
    this.dcR.clear();
    this.hpZ = 0;
    this.ready = false;
    this.gainsReady = false;
  }

  setControls(c) {
    const type = DELAYS_48K[c.type] ? c.type : "room";
    const typeChanged = type !== this.type;
    this.type = type;
    this.t60 = c.t60 > 0.05 ? c.t60 : 0.05;
    this.cutoff = c.cutoff > 200 ? c.cutoff : 200;
    this.predelay = c.predelay > 0 ? c.predelay : 0;
    this.width = c.width > 0 ? c.width : 0;
    this.mod = c.mod > 0 ? c.mod : 0;
    this.size = c.size > 0.4 ? c.size : 0.4;
    fillDelaySamples(type, this.size, this.sr, this.targetLen);
    if (typeChanged || !this.ready) {
      for (let i = 0; i < 8; i++) this.curLen[i] = this.targetLen[i];
      this.preCur = Math.max(1, this.predelay * this.sr);
      const spec = EARLY_MS[type];
      this.taps = spec.map((pair, idx) => ({
        samples: Math.max(2, Math.round((pair[0] / 1000) * this.sr)),
        gain: pair[1],
        right: idx % 2 === 1,
      }));
      this.lfoInc = (type === "spring" ? 1.25 : 0.42) / this.sr;
      if (typeChanged) this.clear();
      this.ready = true;
      for (let i = 0; i < 8; i++) this.curLen[i] = this.targetLen[i];
    }
  }

  process(input, outL, outR) {
    const n = input.length;
    const preTarget = Math.max(0, this.predelay * this.sr);
    const modAmt = this.mod * (this.type === "spring" ? 22 : 10) * (this.sr / 48000);
    const dampMix = Math.min(0.82, Math.max(0.04, (11000 - this.cutoff) / 11000));
    for (let i = 0; i < 8; i++) {
      this.gainTarget[i] = loopGainForDelay(this.curLen[i], this.sr, this.t60);
    }
    if (!this.gainsReady) {
      for (let i = 0; i < 8; i++) this.smGain[i] = this.gainTarget[i];
      this.smDamp = dampMix;
      this.gainsReady = true;
    }
    const y = this.y;
    const mixed = this.mixed;
    const spring = this.type === "spring";
    for (let i = 0; i < n; i++) {
      this.smDamp += (dampMix - this.smDamp) * 0.0015;
      this.smWidth += (this.width - this.smWidth) * 0.002;
      this.preCur += (preTarget - this.preCur) * 0.0008;
      for (let d = 0; d < 8; d++) {
        this.curLen[d] += (this.targetLen[d] - this.curLen[d]) * 0.00012;
        this.smGain[d] += (this.gainTarget[d] - this.smGain[d]) * 0.002;
      }
      let x0 = input[i] || 0;
      if (!Number.isFinite(x0) || x0 > 4 || x0 < -4) {
        this.clear();
        x0 = 0;
      }
      this.hpZ += this.hpC * (x0 - this.hpZ);
      const x = x0 - this.hpZ;
      const pre = this.preCur >= 1.5 ? this.early.read(this.preCur) : x;
      let earlyL = 0;
      let earlyR = 0;
      for (let t = 0; t < this.taps.length; t++) {
        const tap = this.taps[t];
        const s = this.early.read(this.preCur + tap.samples) * tap.gain;
        if (tap.right) earlyR += s;
        else earlyL += s;
      }
      this.early.write(x);

      let diffused = pre;
      for (let a = 0; a < 4; a++) diffused = this.ap[a].process(diffused, this.apLen[a], AP_GAIN[a]);

      this.lfo += this.lfoInc;
      if (this.lfo > 1) this.lfo -= 1;
      const s1 = Math.sin(this.lfo * 6.283185307179586);
      const s2 = Math.sin(this.lfo * 6.283185307179586 + 2.2);

      for (let d = 0; d < 8; d++) {
        let len = this.curLen[d];
        if (d === 0) len += s1 * modAmt;
        else if (d === 5) len += s2 * modAmt * 0.65;
        y[d] = this.lines[d].read(len);
      }
      hadamard8(y, mixed);
      const inject = diffused * this.inject;
      for (let d = 0; d < 8; d++) {
        const lp = this.damp[d].process(mixed[d], this.lpCoeff);
        const shaped = mixed[d] + (lp - mixed[d]) * this.smDamp;
        let fb = shaped * this.smGain[d];
        if (fb > 1.25 || fb < -1.25) fb = Math.tanh(fb);
        this.lines[d].write(fb + inject);
      }

      let l = earlyL;
      let r = earlyR;
      for (let d = 0; d < 8; d++) {
        const s = y[d] * this.fdnTrim;
        if (d & 1) r += s;
        else l += s;
      }
      if (spring) {
        const dlen = this.dripBase + s1 * this.dripMod;
        const dr = this.drip.read(dlen);
        const band = dr - this.dripLp.process(dr, 0.32);
        this.drip.write(x * 0.7 + band * 0.46);
        l += band * 0.38;
        r += band * 0.3;
      }

      const mid = 0.5 * (l + r);
      const side = 0.5 * (l - r) * this.smWidth;
      let ol = this.dcL.process(mid + side);
      let orr = this.dcR.process(mid - side);
      if (!Number.isFinite(ol) || ol > 2) ol = ol > 0 && Number.isFinite(ol) ? 2 : 0;
      else if (ol < -2) ol = -2;
      if (!Number.isFinite(orr) || orr > 2) orr = orr > 0 && Number.isFinite(orr) ? 2 : 0;
      else if (orr < -2) orr = -2;
      outL[i] = ol;
      outR[i] = orr;
    }
  }
}
