// Original loops, synthesized in this file. No samples, no third-party audio.
// Each buffer is an exact number of bars and crossfaded so the loop point is seamless.

export const LOOP_BPM = 96;
export const LOOP_BARS = 2;

export const LOOPS = [
  { id: "chords", name: "Clean chords", hint: "Open electric chords. Hear the reverb and delay tail.", kind: "buffer" },
  { id: "riff", name: "Guitar riff", hint: "A single-note line that repeats.", kind: "buffer" },
  { id: "arp", name: "Arpeggio", hint: "Notes picked one at a time.", kind: "buffer" },
  { id: "bass", name: "Bass line", hint: "A simple low line under the pedals.", kind: "buffer" },
  { id: "drums", name: "Drum beat", hint: "Kick, snare, and hats, looping.", kind: "buffer" },
  { id: "keys", name: "Soft keys", hint: "A held pad. Good for chorus and wash.", kind: "buffer" },
  { id: "lead", name: "Synth lead", hint: "A bright melody, a little like a voice.", kind: "buffer" },
  { id: "notes", name: "Test notes", hint: "Pick one note, a chord, or a held tone. The mic stays off.", kind: "notes" },
];

export function loopSeconds() {
  return LOOP_BARS * 4 * (60 / LOOP_BPM);
}

export function bufferLoops() {
  return LOOPS.filter((loop) => loop.kind === "buffer");
}

function hz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeRand(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function beatSample(sr, beat) {
  return Math.round(beat * (60 / LOOP_BPM) * sr);
}

function addPluck(buf, sr, start, freq, seconds, amp, rand) {
  if (start >= buf.length) return;
  const period = Math.max(2, Math.round(sr / freq));
  const delay = new Float32Array(period);
  for (let i = 0; i < period; i++) delay[i] = rand() * 2 - 1;
  const n = Math.min(buf.length - start, Math.round(seconds * sr));
  let idx = 0;
  let prev = 0;
  const fb = 0.945;
  for (let i = 0; i < n; i++) {
    const x = delay[idx];
    const y = fb * (0.5 * x + 0.5 * prev);
    prev = y;
    delay[idx] = y;
    idx++;
    if (idx >= period) idx = 0;
    const att = i < 12 ? i / 12 : 1;
    buf[start + i] += y * amp * att;
  }
}

function addChord(buf, sr, start, midis, rand) {
  for (let i = 0; i < midis.length; i++) {
    addPluck(buf, sr, start + Math.round(i * 0.014 * sr), hz(midis[i]), 1.9, 0.2, rand);
  }
}

function addBass(buf, sr, start, midi, seconds) {
  const n = Math.min(buf.length - start, Math.round(seconds * sr));
  const freq = hz(midi);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 2.4) * (1 - Math.exp(-t * 90));
    const p = 2 * Math.PI * freq * t;
    const y = Math.sin(p) * 0.72 + Math.sin(2 * p) * 0.18 + Math.sin(3 * p) * 0.08;
    buf[start + i] += y * env * 0.55;
  }
}

function addKick(buf, sr, start) {
  const n = Math.min(buf.length - start, Math.round(0.22 * sr));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 48 + 130 * Math.exp(-t * 26);
    phase += 2 * Math.PI * f / sr;
    const env = Math.exp(-t * 16) * (1 - Math.exp(-t * 400));
    buf[start + i] += Math.sin(phase) * env * 0.95;
  }
}

function addSnare(buf, sr, start, rand) {
  const n = Math.min(buf.length - start, Math.round(0.18 * sr));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const noise = rand() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const env = Math.exp(-t * 20);
    const body = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 28);
    buf[start + i] += ((noise - lp) * 0.55 + body * 0.35) * env;
  }
}

function addHat(buf, sr, start, rand, open) {
  const n = Math.min(buf.length - start, Math.round((open ? 0.09 : 0.04) * sr));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const noise = rand() * 2 - 1;
    lp += 0.08 * (noise - lp);
    const env = Math.exp(-t * (open ? 28 : 70));
    buf[start + i] += (noise - lp) * env * 0.22;
  }
}

function addLead(buf, sr, start, midi, seconds) {
  const n = Math.min(buf.length - start, Math.round(seconds * sr));
  const freq = hz(midi);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.sin(Math.PI * Math.min(1, i / n)) * Math.exp(-t * 1.6);
    let y = 0;
    for (let h = 1; h <= 5; h++) y += Math.sin(2 * Math.PI * freq * h * t) / h;
    buf[start + i] += y * env * 0.18;
  }
}

function periodicHz(midi, n, sr) {
  const cycles = Math.max(1, Math.round(hz(midi) * n / sr));
  return cycles * sr / n;
}

function renderInto(id, sr) {
  const seconds = loopSeconds();
  const n = Math.round(sr * seconds);
  const buf = new Float32Array(n);
  const rand = makeRand(id.length * 10007 + id.charCodeAt(0) * 17);
  if (id === "chords") {
    addChord(buf, sr, beatSample(sr, 0), [48, 52, 55, 59], rand);
    addChord(buf, sr, beatSample(sr, 4), [45, 48, 52, 57], rand);
  } else if (id === "riff") {
    const notes = [45, 48, 50, 52, 50, 48, 45, 43];
    for (let i = 0; i < notes.length; i++) addPluck(buf, sr, beatSample(sr, i), hz(notes[i]), 0.42, 0.55, rand);
  } else if (id === "arp") {
    const notes = [60, 64, 67, 72, 67, 64, 60, 55];
    for (let i = 0; i < notes.length; i++) addPluck(buf, sr, beatSample(sr, i), hz(notes[i]), 0.4, 0.48, rand);
  } else if (id === "bass") {
    const notes = [33, 33, 36, 40];
    for (let i = 0; i < notes.length; i++) addBass(buf, sr, beatSample(sr, i * 2), notes[i], 0.9);
  } else if (id === "drums") {
    for (let eighth = 0; eighth < 16; eighth++) {
      const at = beatSample(sr, eighth * 0.5);
      if (eighth % 4 === 0) addKick(buf, sr, at);
      if (eighth % 4 === 2) addSnare(buf, sr, at, rand);
      addHat(buf, sr, at, rand, eighth % 4 === 2);
    }
  } else if (id === "keys") {
    const midis = [48, 52, 55, 59, 62];
    const tremCycles = 2;
    for (let i = 0; i < n; i++) {
      const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * tremCycles * i / n);
      let y = 0;
      for (let p = 0; p < midis.length; p++) {
        y += Math.sin(2 * Math.PI * periodicHz(midis[p], n, sr) * i / sr + p);
      }
      buf[i] += y * 0.06 * trem;
    }
  } else if (id === "lead") {
    const notes = [64, 67, 69, 72, 69, 67, 64, 62];
    for (let i = 0; i < notes.length; i++) addLead(buf, sr, beatSample(sr, i), notes[i], 0.35);
  }
  const out = buf;
  if (id !== "keys") {
    const fade = Math.round(sr * 0.02);
    for (let i = 0; i < fade; i++) out[n - fade + i] *= 1 - i / fade;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i];
  mean /= n;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out[i] -= mean;
    const a = out[i] < 0 ? -out[i] : out[i];
    if (a > peak) peak = a;
  }
  const gain = peak > 1e-8 ? 0.42 / peak : 0;
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}

export function renderLoop(id, sampleRate) {
  const loop = LOOPS.find((item) => item.id === id);
  if (!loop || loop.kind !== "buffer") throw new Error("No buffer loop named " + id);
  const sr = sampleRate > 0 ? sampleRate : 48000;
  return renderInto(id, sr);
}
