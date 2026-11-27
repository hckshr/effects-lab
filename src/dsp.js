// Knob mappings, presets, and chain helpers. No browser APIs.

export const PEDAL_IDS = ["drive", "mod", "filter", "delay", "reverb"];

export const MAX_DELAY_FEEDBACK = 0.7;
export const MAX_FLANGER_FEEDBACK = 0.55;
export const MAX_PHASER_FEEDBACK = 0.5;
export const MAX_STRING_FEEDBACK = 0.78;
export const STORAGE_VERSION = 3;
export const DOUBLE_TAP_MS = 320;
export const INPUT_GAIN_MAX = 3;
export const DELAY_MIN = 0.04;
export const DELAY_MAX = 1;

const MOD_RATE = {
  chorus: [0.15, 2.5],
  phaser: [0.05, 4],
  flanger: [0.08, 3],
  tremolo: [1.2, 10],
  vibrato: [2.2, 8],
};

const TYPES = {
  drive: ["drive"],
  mod: ["chorus", "phaser", "flanger", "tremolo", "vibrato"],
  filter: ["wah", "lowpass", "highpass"],
  delay: ["delay"],
  reverb: ["room", "hall", "spring", "plate"],
};

const DEFAULT_TYPE = {
  drive: "drive",
  mod: "chorus",
  filter: "wah",
  delay: "delay",
  reverb: "room",
};

export const DEFAULT_PARAMS = {
  drive: { gain: 0.3, tone: 0.55, level: 0.7, mix: 1, fuzz: 0.2 },
  mod: { rate: 0.35, depth: 0.4, mix: 0.5, color: 0.35, width: 0.75 },
  filter: { freq: 0.45, resonance: 0.4, depth: 0.55, rate: 0.35, release: 0.4, mix: 1 },
  delay: { time: 0.45, feedback: 0.35, mix: 0.3, tone: 0.45, modDepth: 0.1, modRate: 0.25, lowCut: 0.3 },
  reverb: { decay: 0.4, mix: 0.3, tone: 0.55, predelay: 0.12, width: 0.85, mod: 0.3, size: 0.45 },
};

const LABELS = {
  drive: { gain: "Gain", tone: "Tone", level: "Level", mix: "Blend", fuzz: "Fuzz" },
  mod: { rate: "Rate", depth: "Depth", mix: "Mix", color: "Tone", width: "Width" },
  filter: { freq: "Freq", resonance: "Reso", depth: "Depth", rate: "Rate", release: "Release", mix: "Blend" },
  delay: { time: "Time", feedback: "Feedback", mix: "Mix", tone: "Tone", modDepth: "Wow", modRate: "Flutter", lowCut: "Low Cut" },
  reverb: { decay: "Decay", mix: "Mix", tone: "Tone", predelay: "Pre-delay", width: "Width", mod: "Mod", size: "Size" },
};

export const PEDALS = {
  drive: { name: "Drive", blend: "replace", main: ["gain", "tone", "level"], more: ["mix", "fuzz"], types: null },
  mod: {
    name: "Modulation",
    blend: "replace",
    main: ["rate", "depth", "mix", "color"],
    more: ["width"],
    types: [
      { id: "chorus", label: "Chorus" },
      { id: "phaser", label: "Phaser" },
      { id: "flanger", label: "Flanger" },
      { id: "tremolo", label: "Tremolo" },
      { id: "vibrato", label: "Vibrato" },
    ],
  },
  filter: {
    name: "Filter",
    blend: "replace",
    main: ["freq", "resonance", "depth", "rate"],
    more: ["release", "mix"],
    types: [
      { id: "wah", label: "Auto-Wah" },
      { id: "lowpass", label: "Low Pass" },
      { id: "highpass", label: "High Pass" },
    ],
  },
  delay: {
    name: "Delay",
    blend: "add",
    main: ["time", "feedback", "mix", "tone"],
    more: ["modDepth", "modRate", "lowCut"],
    types: null,
    tap: true,
  },
  reverb: {
    name: "Reverb",
    blend: "add",
    main: ["decay", "mix", "tone", "predelay"],
    more: ["width", "mod", "size"],
    types: [
      { id: "room", label: "Room" },
      { id: "hall", label: "Hall" },
      { id: "spring", label: "Spring" },
      { id: "plate", label: "Plate" },
    ],
  },
};

export const PRESETS = [
  {
    id: "clean-room",
    name: "Clean Room",
    order: ["reverb"],
    pedals: {
      reverb: { type: "room", params: { decay: 0.43, mix: 0.28, tone: 0.58, predelay: 0.16, width: 0.8, mod: 0.22, size: 0.4 } },
    },
  },
  {
    id: "surf",
    name: "Surf Spring",
    order: ["mod", "reverb"],
    pedals: {
      mod: { type: "tremolo", params: { rate: 0.74, depth: 0.62, mix: 0.9, color: 0.28, width: 0.35 } },
      reverb: { type: "spring", params: { decay: 0.54, mix: 0.4, tone: 0.66, predelay: 0.06, width: 0.7, mod: 0.72, size: 0.35 } },
    },
  },
  {
    id: "big-hall",
    name: "Big Hall",
    order: ["reverb"],
    pedals: {
      reverb: { type: "hall", params: { decay: 0.83, mix: 0.4, tone: 0.46, predelay: 0.34, width: 1, mod: 0.28, size: 0.72 } },
    },
  },
  {
    id: "slapback",
    name: "Slapback",
    order: ["delay"],
    pedals: {
      delay: { params: { time: 0.314, feedback: 0.14, mix: 0.38, tone: 0.5, modDepth: 0.05, modRate: 0.3, lowCut: 0.28 } },
    },
  },
  {
    id: "ambient",
    name: "Ambient Wash",
    order: ["mod", "delay", "reverb"],
    pedals: {
      mod: { type: "chorus", params: { rate: 0.49, depth: 0.42, mix: 0.48, color: 0.62, width: 0.85 } },
      delay: { params: { time: 0.75, feedback: 0.48, mix: 0.34, tone: 0.32, modDepth: 0.28, modRate: 0.22, lowCut: 0.4 } },
      reverb: { type: "hall", params: { decay: 0.86, mix: 0.46, tone: 0.4, predelay: 0.28, width: 1, mod: 0.36, size: 0.8 } },
    },
  },
  {
    id: "crunch",
    name: "Crunch",
    order: ["drive", "reverb"],
    pedals: {
      drive: { params: { gain: 0.4, tone: 0.52, level: 0.62, mix: 0.85, fuzz: 0.22 } },
      reverb: { type: "room", params: { decay: 0.36, mix: 0.22, tone: 0.5, predelay: 0.1, width: 0.75, mod: 0.18, size: 0.32 } },
    },
  },
  {
    id: "wah-funk",
    name: "Wah Funk",
    order: ["filter", "delay"],
    pedals: {
      filter: { type: "wah", params: { freq: 0.42, resonance: 0.58, depth: 0.75, rate: 0.32, release: 0.38, mix: 1 } },
      delay: { params: { time: 0.48, feedback: 0.32, mix: 0.22, tone: 0.4, modDepth: 0.08, modRate: 0.25, lowCut: 0.35 } },
    },
  },
];

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const TEST_SOUNDS = ["pluck", "chord", "tone", "loop"];
export const TEST_SOUND_COPY = {
  pluck: { label: "Single note", hint: "One guitar-like note; hear the reverb/delay tail" },
  chord: { label: "Chord", hint: "Strummed chord" },
  tone: { label: "Held note", hint: "Steady note; good for chorus/tremolo" },
  loop: { label: "Riff", hint: "Repeating note + snare pattern" },
};
export const REPEAT_COPY = {
  label: "Auto-replay",
  hint: "Replays every couple of seconds so you can tweak knobs hands-free",
};

export function defaultKnobPosition(pedal, param) {
  if (pedal === "global" && param === "input") return 1 / INPUT_GAIN_MAX;
  if (pedal === "global" && param === "master") return 0.8;
  const table = DEFAULT_PARAMS[pedal];
  if (table && Object.prototype.hasOwnProperty.call(table, param)) return table[param];
  return 0;
}

export function isDoubleTap(previousMs, nowMs) {
  if (!(previousMs > 0) || !(nowMs > 0)) return false;
  const dt = nowMs - previousMs;
  return dt >= 40 && dt <= DOUBLE_TAP_MS;
}

export function defaultPlayer() {
  return { note: "C", octave: 3, sound: "pluck", repeat: false };
}

export function sanitizePlayer(raw) {
  const player = defaultPlayer();
  if (!raw || typeof raw !== "object") return player;
  if (NOTE_NAMES.includes(raw.note)) player.note = raw.note;
  const oct = Number(raw.octave);
  if (Number.isFinite(oct)) player.octave = clamp(Math.round(oct), 2, 5);
  if (TEST_SOUNDS.includes(raw.sound)) player.sound = raw.sound;
  player.repeat = !!raw.repeat;
  return player;
}

export function noteFrequency(name, octave) {
  const index = NOTE_NAMES.indexOf(name);
  const midi = 12 * (octave + 1) + (index < 0 ? 0 : index);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function majorChordFrequencies(rootHz) {
  return [0, 4, 7, 12].map((semitone) => rootHz * Math.pow(2, semitone / 12));
}

export function clamp(x, a, b) {
  if (x < a) return a;
  if (x > b) return b;
  return x;
}

export function clamp01(x) {
  return clamp(x, 0, 1);
}

export function logMap(k, min, max) {
  return min * Math.pow(max / min, clamp01(k));
}

export function logUnmap(value, min, max) {
  const v = clamp(value, min, max);
  return Math.log(v / min) / Math.log(max / min);
}

export function knobFromDelaySeconds(sec) {
  return logUnmap(sec, DELAY_MIN, DELAY_MAX);
}

export function reverbT60(k) {
  return logMap(k, 0.25, 8);
}

export function reverbCutoff(k) {
  return logMap(k, 900, 12000);
}

export function storageKeyFor(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ":v1";
}

export function validType(id, type) {
  return (TYPES[id] || []).includes(type);
}

export function reverbTypeIndex(type) {
  const i = TYPES.reverb.indexOf(type);
  return i < 0 ? 0 : i;
}

export function mapParam(pedal, param, knob, type) {
  const k = clamp01(Number.isFinite(knob) ? knob : 0);
  const key = pedal + "." + param;
  if (key === "drive.gain") return 1 + k * 24;
  if (key === "drive.tone") return logMap(k, 500, 6200);
  if (key === "drive.level") return k * 1.5;
  if (key === "drive.mix" || key === "drive.fuzz") return k;
  if (key === "mod.rate") {
    const range = MOD_RATE[type] || MOD_RATE.chorus;
    return logMap(k, range[0], range[1]);
  }
  if (key === "mod.depth") {
    if (type === "flanger") return 0.00025 + k * 0.0026;
    if (type === "phaser") return 100 + k * 500;
    if (type === "tremolo") return k;
    if (type === "vibrato") return 0.0006 + k * 0.0032;
    return 0.0008 + k * 0.0052;
  }
  if (key === "mod.mix" || key === "mod.width") return k;
  if (key === "mod.color") {
    if (type === "flanger") return k * MAX_FLANGER_FEEDBACK;
    if (type === "phaser") return k * MAX_PHASER_FEEDBACK;
    if (type === "tremolo") return k;
    return logMap(k, 800, 9000);
  }
  if (key === "filter.freq") {
    if (type === "wah") return logMap(k, 200, 480);
    if (type === "highpass") return logMap(k, 50, 2800);
    return logMap(k, 180, 7800);
  }
  if (key === "filter.range") return logMap(k, 700, 3400);
  if (key === "filter.resonance") return type === "wah" ? 0.9 + k * 7.5 : 0.5 + k * 3.2;
  if (key === "filter.depth") return k;
  if (key === "filter.rate") return type === "wah" ? logMap(k, 0.004, 0.07) : logMap(k, 0.06, 6);
  if (key === "filter.release") return logMap(k, 0.04, 0.55);
  if (key === "filter.mix") return k;
  if (key === "delay.time") return logMap(k, DELAY_MIN, DELAY_MAX);
  if (key === "delay.feedback") return k * MAX_DELAY_FEEDBACK;
  if (key === "delay.mix") return k;
  if (key === "delay.tone") return logMap(k, 700, 6800);
  if (key === "delay.modDepth") return k * 0.004;
  if (key === "delay.modRate") return logMap(k, 0.12, 4);
  if (key === "delay.lowCut") return logMap(k, 40, 420);
  if (key === "reverb.decay") return reverbT60(k);
  if (key === "reverb.tone") return reverbCutoff(k);
  if (key === "reverb.predelay") return k * 0.12;
  if (key === "reverb.size") return 0.7 + k * 0.65;
  if (key === "reverb.mix" || key === "reverb.width" || key === "reverb.mod") return k;
  return k;
}

function hzText(n) {
  if (n < 10) return n.toFixed(2) + " Hz";
  if (n < 100) return n.toFixed(1) + " Hz";
  return Math.round(n) + " Hz";
}

function msText(sec) {
  return Math.round(sec * 1000) + " ms";
}

function pctText(k) {
  return Math.round(clamp01(k) * 100) + "%";
}

export function formatParam(pedal, param, knob, type) {
  const v = mapParam(pedal, param, knob, type);
  if (pedal === "drive" && param === "gain") {
    const db = 20 * Math.log10(Math.max(1e-4, v));
    return (db >= 0 ? "+" : "") + db.toFixed(1) + " dB";
  }
  if (pedal === "drive" && param === "tone") return hzText(v);
  if (pedal === "drive" && param === "level") return pctText(knob);
  if (pedal === "mod" && param === "rate") return hzText(v);
  if (pedal === "mod" && param === "depth" && type === "phaser") return hzText(v);
  if (pedal === "mod" && param === "depth" && type === "tremolo") return pctText(v);
  if (pedal === "mod" && param === "depth") return (v * 1000).toFixed(1) + " ms";
  if (pedal === "mod" && param === "color" && (type === "phaser" || type === "flanger" || type === "tremolo")) return pctText(knob);
  if (pedal === "mod" && param === "color") return hzText(v);
  if (pedal === "filter" && param === "freq") return hzText(v);
  if (pedal === "filter" && param === "rate" && type === "wah") return msText(v);
  if (pedal === "filter" && param === "rate") return hzText(v);
  if (pedal === "filter" && param === "release") return msText(v);
  if (pedal === "filter" && param === "resonance") return v.toFixed(1);
  if (pedal === "delay" && param === "time") return v < 1 ? msText(v) : v.toFixed(2) + " s";
  if (pedal === "delay" && param === "tone" || pedal === "delay" && param === "lowCut") return hzText(v);
  if (pedal === "delay" && param === "modDepth") return (v * 1000).toFixed(1) + " ms";
  if (pedal === "delay" && param === "modRate") return hzText(v);
  if (pedal === "reverb" && param === "decay") return v.toFixed(1) + " s";
  if (pedal === "reverb" && param === "tone") return hzText(v);
  if (pedal === "reverb" && param === "predelay") return msText(v);
  if (pedal === "reverb" && param === "size") return v.toFixed(2) + "×";
  return pctText(knob);
}

export function paramLabel(pedal, param, type) {
  if (pedal === "mod" && param === "color") {
    if (type === "tremolo") return "Shape";
    if (type === "phaser" || type === "flanger") return "Feedback";
    return "Tone";
  }
  if (pedal === "filter" && param === "rate") return type === "wah" ? "Attack" : "Rate";
  if (pedal === "filter" && param === "depth") return type === "wah" ? "Depth" : "Sweep";
  if (pedal === "filter" && param === "freq") return type === "wah" ? "Range" : "Freq";
  return LABELS[pedal][param];
}

export function displayName(id, type) {
  if (id === "mod") {
    return { chorus: "Chorus", phaser: "Phaser", flanger: "Flanger", tremolo: "Tremolo", vibrato: "Vibrato" }[type] || "Modulation";
  }
  if (id === "filter") {
    return { wah: "Auto-Wah", lowpass: "Low Pass", highpass: "High Pass" }[type] || "Filter";
  }
  if (id === "reverb") {
    return { room: "Room", hall: "Hall", spring: "Spring", plate: "Plate" }[type] || "Reverb";
  }
  if (id === "drive") return "Drive";
  if (id === "delay") return "Delay";
  return id;
}

export function chainText(state) {
  if (!state.order.length) return "No pedals — dry signal";
  return state.order.map((id) => displayName(id, state.pedals[id].type)).join(" → ");
}

export function blendGains(mode, enabled, mix) {
  const m = clamp01(mix);
  if (!enabled) return { dry: 1, wet: 0 };
  if (mode === "add") return { dry: 1, wet: m };
  const theta = m * Math.PI / 2;
  return { dry: Math.cos(theta), wet: Math.sin(theta) };
}

export function driveMakeup(preGain, fuzz) {
  const f = clamp01(fuzz);
  const soft = Math.tanh(preGain * 2.4);
  const hard = Math.min(1, Math.tanh(preGain * 6) * 1.05);
  const peak = soft * (1 - f) + hard * f;
  return 1 / Math.max(0.22, peak);
}

export function formatGainDb(gain) {
  if (!(gain > 0.001)) return "Off";
  const db = 20 * Math.log10(gain);
  return (db >= 0 ? "+" : "") + db.toFixed(1) + " dB";
}

export function meterPercent(rms) {
  const db = 20 * Math.log10(Math.max(rms, 1e-8));
  return clamp((db + 42) / 42, 0, 1);
}

function makeCurve(fn) {
  const n = 2049;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}

export function makeSoftCurve() {
  return makeCurve((x) => Math.tanh(x * 2.4));
}

export function makeHardCurve() {
  return makeCurve((x) => {
    const y = Math.tanh(x * 8);
    const asym = Math.tanh((x + 0.18) * 6.5);
    return Math.max(-0.98, Math.min(0.98, y * 0.62 + asym * 0.38));
  });
}

export function makeSafetyCurve() {
  const drive = 1.55;
  const norm = Math.tanh(drive);
  return makeCurve((x) => Math.tanh(x * drive) / norm);
}

export function makeHardClipCurve() {
  const limit = 0.95;
  return makeCurve((x) => (x < -limit ? -limit : x > limit ? limit : x));
}

export function makeTremCurve() {
  return makeCurve((x) => Math.tanh(x * 5));
}

export function moveItem(list, index, dir) {
  const next = list.slice();
  const j = index + dir;
  if (index < 0 || index >= next.length || j < 0 || j >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(j, 0, item);
  return next;
}

export function reorder(list, id, targetIndex) {
  const next = list.filter((x) => x !== id);
  const i = Math.max(0, Math.min(next.length, targetIndex));
  next.splice(i, 0, id);
  return next;
}

export function freshState() {
  const pedals = {};
  for (const id of PEDAL_IDS) {
    pedals[id] = {
      onBoard: false,
      enabled: false,
      type: DEFAULT_TYPE[id],
      more: false,
      params: Object.assign({}, DEFAULT_PARAMS[id]),
    };
  }
  return {
    source: "library",
    deviceId: "",
    inputGain: 1,
    master: 0.8,
    order: [],
    preset: null,
    player: defaultPlayer(),
    pedals,
  };
}

export function applyPreset(state, presetId) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return state;
  const next = freshState();
  next.source = state.source;
  next.deviceId = state.deviceId;
  next.inputGain = state.inputGain;
  next.master = state.master;
  next.player = Object.assign(defaultPlayer(), state.player);
  next.order = preset.order.slice();
  next.preset = preset.id;
  for (const id of preset.order) {
    const src = preset.pedals[id] || {};
    const pedal = next.pedals[id];
    pedal.onBoard = true;
    pedal.enabled = true;
    if (src.type && validType(id, src.type)) pedal.type = src.type;
    pedal.params = Object.assign({}, DEFAULT_PARAMS[id], src.params || {});
    for (const key of Object.keys(pedal.params)) pedal.params[key] = clamp01(pedal.params[key]);
  }
  return next;
}

export function initialState() {
  return applyPreset(freshState(), "clean-room");
}

export function serialize(state) {
  const pedals = {};
  for (const id of PEDAL_IDS) {
    const p = state.pedals[id];
    pedals[id] = { enabled: !!p.enabled, type: p.type, more: !!p.more, params: Object.assign({}, p.params) };
  }
  return {
    v: STORAGE_VERSION,
    source: state.source,
    deviceId: state.deviceId || "",
    inputGain: state.inputGain,
    master: state.master,
    player: Object.assign(defaultPlayer(), state.player),
    looping: Object.assign({}, state.looping || {}),
    order: state.order.slice(),
    preset: state.preset,
    pedals,
  };
}

export function hydrate(raw) {
  if (!raw || typeof raw !== "object") return initialState();
  const next = freshState();
  next.source = "library";
  next.player = sanitizePlayer(raw.player);
  next.looping = {};
  if (raw.looping && typeof raw.looping === "object") {
    for (const key of Object.keys(raw.looping)) {
      if (typeof key === "string" && key.length < 32) next.looping[key] = !!raw.looping[key];
    }
  }
  next.deviceId = typeof raw.deviceId === "string" ? raw.deviceId.slice(0, 256) : "";
  const ig = Number(raw.inputGain);
  next.inputGain = Number.isFinite(ig) ? clamp(ig, 0, INPUT_GAIN_MAX) : 1;
  const m = Number(raw.master);
  next.master = Number.isFinite(m) ? clamp(m, 0, 1) : 0.8;
  const saved = raw.pedals && typeof raw.pedals === "object" ? raw.pedals : {};
  for (const id of PEDAL_IDS) {
    const src = saved[id];
    if (!src || typeof src !== "object") continue;
    const pedal = next.pedals[id];
    if (typeof src.type === "string" && validType(id, src.type)) pedal.type = src.type;
    pedal.more = !!src.more;
    pedal.enabled = !!src.enabled;
    if (src.params && typeof src.params === "object") {
      for (const key of Object.keys(DEFAULT_PARAMS[id])) {
        const n = Number(src.params[key]);
        if (Number.isFinite(n)) pedal.params[key] = clamp01(n);
      }
    }
  }
  const order = [];
  const list = Array.isArray(raw.order) ? raw.order : [];
  for (const id of list) {
    if (PEDAL_IDS.includes(id) && !order.includes(id)) order.push(id);
  }
  next.order = order;
  for (const id of PEDAL_IDS) {
    next.pedals[id].onBoard = order.includes(id);
    if (!order.includes(id)) next.pedals[id].enabled = false;
  }
  next.preset = PRESETS.some((p) => p.id === raw.preset) ? raw.preset : null;
  return next;
}
