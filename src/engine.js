// Web Audio graph. Pedals are stereo so a chorus or reverb keeps its image
// wherever it sits in the chain. Knobs move with setTargetAtTime.

const SOFT_CURVE = makeSoftCurve();
const HARD_CURVE = makeHardCurve();
const CLIP_CURVE = makeSafetyCurve();
const TREM_CURVE = makeTremCurve();

function stereoGain(ctx) {
  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = "explicit";
  g.channelInterpretation = "speakers";
  return g;
}

function approach(ctx, param, value, tc) {
  const now = ctx.currentTime;
  const v = Number.isFinite(value) ? value : 0;
  try {
    param.setTargetAtTime(v, now, tc || 0.02);
  } catch (err) {
    param.value = v;
  }
}

function stopBag(bag) {
  if (!bag) return;
  for (let i = 0; i < bag.length; i++) {
    const node = bag[i];
    try {
      if (typeof node.stop === "function") node.stop();
    } catch (err) { /* already stopped */ }
    try { node.disconnect(); } catch (err) { /* already disconnected */ }
  }
  bag.length = 0;
}

function buildChorus(ctx, head, wetOut, bag, kind) {
  const base = kind === "vibrato" ? 0.0075 : 0.016;
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  head.connect(splitter);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  const inv = ctx.createGain();
  inv.gain.value = kind === "vibrato" ? 1 : -1;
  lfo.connect(inv);
  const delays = [];
  const depths = [];
  const pans = [];
  const tones = [];
  for (let ch = 0; ch < 2; ch++) {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = base + (kind === "vibrato" ? 0 : ch * 0.0015);
    const depth = ctx.createGain();
    (ch === 0 ? lfo : inv).connect(depth);
    depth.connect(delay.delayTime);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = 0.7;
    tone.frequency.value = 4000;
    const gL = ctx.createGain();
    const gR = ctx.createGain();
    splitter.connect(delay, ch);
    delay.connect(tone);
    tone.connect(gL);
    tone.connect(gR);
    gL.connect(merger, 0, 0);
    gR.connect(merger, 0, 1);
    delays.push(delay);
    depths.push(depth);
    pans.push([gL, gR]);
    tones.push(tone);
    bag.push(delay, depth, tone, gL, gR);
  }
  merger.connect(wetOut);
  lfo.start();
  bag.push(splitter, merger, lfo, inv);
  return { kind: "chorus", lfo, delays, depths, pans, tones };
}

function buildFlanger(ctx, head, wetOut, bag) {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  head.connect(splitter);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  const inv = ctx.createGain();
  inv.gain.value = -1;
  lfo.connect(inv);
  const fbs = [];
  const depths = [];
  const delays = [];
  for (let ch = 0; ch < 2; ch++) {
    const sum = ctx.createGain();
    const delay = ctx.createDelay(0.02);
    delay.delayTime.value = 0.0032;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    lp.Q.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 140;
    hp.Q.value = 0.7;
    const fb = ctx.createGain();
    const depth = ctx.createGain();
    (ch === 0 ? lfo : inv).connect(depth);
    depth.connect(delay.delayTime);
    splitter.connect(sum, ch);
    fb.connect(sum);
    sum.connect(delay);
    delay.connect(lp);
    lp.connect(hp);
    hp.connect(fb);
    hp.connect(merger, 0, ch);
    fbs.push(fb);
    depths.push(depth);
    delays.push(delay);
    bag.push(sum, delay, lp, hp, fb, depth);
  }
  merger.connect(wetOut);
  lfo.start();
  bag.push(splitter, merger, lfo, inv);
  return { kind: "flanger", lfo, fbs, depths, delays };
}

function buildPhaser(ctx, head, wetOut, bag) {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  head.connect(splitter);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  const inv = ctx.createGain();
  inv.gain.value = -1;
  lfo.connect(inv);
  const ratios = [1, 1.16, 1.34, 1.55, 1.78, 2.05];
  const stages = [[], []];
  const depthGains = [[], []];
  const fbs = [];
  for (let ch = 0; ch < 2; ch++) {
    const sum = ctx.createGain();
    splitter.connect(sum, ch);
    let node = sum;
    for (let s = 0; s < ratios.length; s++) {
      const ap = ctx.createBiquadFilter();
      ap.type = "allpass";
      ap.Q.value = 0.9;
      ap.frequency.value = 780 * ratios[s];
      const dg = ctx.createGain();
      (ch === 0 ? lfo : inv).connect(dg);
      dg.connect(ap.frequency);
      node.connect(ap);
      node = ap;
      stages[ch].push(ap);
      depthGains[ch].push(dg);
      bag.push(ap, dg);
    }
    const fb = ctx.createGain();
    node.connect(fb);
    fb.connect(sum);
    node.connect(merger, 0, ch);
    fbs.push(fb);
    bag.push(sum, fb);
  }
  merger.connect(wetOut);
  lfo.start();
  bag.push(splitter, merger, lfo, inv);
  return { kind: "phaser", lfo, stages, depthGains, fbs, ratios };
}

function buildTremolo(ctx, head, wetOut, bag) {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  head.connect(splitter);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  const shaper = ctx.createWaveShaper();
  shaper.curve = TREM_CURVE;
  const raw = ctx.createGain();
  const shaped = ctx.createGain();
  const bus = ctx.createGain();
  lfo.connect(raw);
  lfo.connect(shaper);
  shaper.connect(shaped);
  raw.connect(bus);
  shaped.connect(bus);
  const depthL = ctx.createGain();
  const depthR = ctx.createGain();
  bus.connect(depthL);
  bus.connect(depthR);
  const gL = ctx.createGain();
  const gR = ctx.createGain();
  depthL.connect(gL.gain);
  depthR.connect(gR.gain);
  splitter.connect(gL, 0);
  splitter.connect(gR, 1);
  gL.connect(merger, 0, 0);
  gR.connect(merger, 0, 1);
  merger.connect(wetOut);
  lfo.start();
  bag.push(splitter, merger, lfo, shaper, raw, shaped, bus, depthL, depthR, gL, gR);
  return { kind: "tremolo", lfo, raw, shaped, depthL, depthR, gL, gR };
}

function buildDrive(ctx, head, wetOut, bag) {
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 75;
  hp.Q.value = 0.7;
  const pre = ctx.createGain();
  head.connect(hp);
  hp.connect(pre);
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  pre.connect(splitter);
  const softG = [];
  const hardG = [];
  const tones = [];
  for (let ch = 0; ch < 2; ch++) {
    const soft = ctx.createWaveShaper();
    soft.curve = SOFT_CURVE;
    soft.oversample = "2x";
    const hard = ctx.createWaveShaper();
    hard.curve = HARD_CURVE;
    hard.oversample = "2x";
    const gs = ctx.createGain();
    const gh = ctx.createGain();
    const sum = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = 0.7;
    splitter.connect(soft, ch);
    splitter.connect(hard, ch);
    soft.connect(gs);
    hard.connect(gh);
    gs.connect(sum);
    gh.connect(sum);
    sum.connect(tone);
    tone.connect(merger, 0, ch);
    softG.push(gs);
    hardG.push(gh);
    tones.push(tone);
    bag.push(soft, hard, gs, gh, sum, tone);
  }
  const post = ctx.createGain();
  merger.connect(post);
  post.connect(wetOut);
  bag.push(hp, pre, splitter, merger, post);
  return { pre, softG, hardG, tones, post };
}

function buildFilter(ctx, head, wetOut, bag) {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const sense = ctx.createGain();
  head.connect(splitter);
  head.connect(sense);
  const filters = [];
  for (let ch = 0; ch < 2; ch++) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1200;
    f.Q.value = 0.7;
    splitter.connect(f, ch);
    f.connect(merger, 0, ch);
    filters.push(f);
    bag.push(f);
  }
  merger.connect(wetOut);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0;
  lfo.connect(lfoDepth);
  lfoDepth.connect(filters[0].frequency);
  lfoDepth.connect(filters[1].frequency);
  lfo.start();
  bag.push(splitter, merger, sense, lfo, lfoDepth);
  return { filters, lfo, lfoDepth, sense };
}

function buildDelay(ctx, head, wetOut, bag) {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  head.connect(splitter);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  const inv = ctx.createGain();
  inv.gain.value = -1;
  lfo.connect(inv);
  const delays = [];
  const fbs = [];
  const tones = [];
  const lows = [];
  const depths = [];
  for (let ch = 0; ch < 2; ch++) {
    const sum = ctx.createGain();
    const delay = ctx.createDelay(1.25);
    delay.delayTime.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.707;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.Q.value = 0.707;
    const fb = ctx.createGain();
    const depth = ctx.createGain();
    (ch === 0 ? lfo : inv).connect(depth);
    depth.connect(delay.delayTime);
    splitter.connect(sum, ch);
    fb.connect(sum);
    sum.connect(delay);
    delay.connect(lp);
    lp.connect(hp);
    hp.connect(fb);
    hp.connect(merger, 0, ch);
    delays.push(delay);
    fbs.push(fb);
    tones.push(lp);
    lows.push(hp);
    depths.push(depth);
    bag.push(sum, delay, lp, hp, fb, depth);
  }
  merger.connect(wetOut);
  lfo.start();
  bag.push(splitter, merger, lfo, inv);
  return { lfo, delays, fbs, tones, lows, depths };
}

function makeShell(ctx, blend) {
  const input = stereoGain(ctx);
  const output = stereoGain(ctx);
  const dry = stereoGain(ctx);
  const wet = stereoGain(ctx);
  const head = stereoGain(ctx);
  const wetOut = stereoGain(ctx);
  input.connect(dry);
  dry.connect(output);
  input.connect(head);
  wetOut.connect(wet);
  wet.connect(output);
  dry.gain.value = 1;
  wet.gain.value = 0;
  return { input, output, dry, wet, head, wetOut, blend, bag: [], modBag: [] };
}

class Engine {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.meter = 0;
    this.peakMeter = 0;
    this.displayPeak = 0;
    this.reverbMode = "none";
    this.order = [];
    this.attempts = [];
    this.constraints = null;
    this.onMeter = null;
    this.onDevices = null;
    this.modType = "";
    this.reverbType = "";
    this.filterType = "";
    this.liveFilter = null;
    this.typeTimers = {};
    this.noteTimers = [];
    this.testLive = false;
    this.shells = {};
  }

  async start(state) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      await this.ctx.resume();
      await this.loadWorklet();
      this.build();
      this.sync(state, false);
      this.order = state.order.slice();
      this.reconnectNow();
    } else {
      await this.ctx.resume();
      this.sync(state, false);
    }
    this.running = true;
    this.peakMeter = 0;
    this.displayPeak = 0;
    try {
      await this.applySource(state.source, state.deviceId);
      this.inputError = null;
    } catch (err) {
      this.inputError = err;
      this.tick();
      throw err;
    }
    this.tick();
  }

  async stop() {
    this.running = false;
    this.stopTest();
    this.stopMic();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }

  async loadWorklet() {
    this.workletOk = false;
    try {
      const url = typeof WORKLET_URL === "string" ? WORKLET_URL : "/worklet.js";
      await this.ctx.audioWorklet.addModule(url);
      this.workletOk = true;
    } catch (err) {
      this.workletOk = false;
    }
  }

  build() {
    const ctx = this.ctx;
    this.inputGain = stereoGain(ctx);
    this.micGain = ctx.createGain();
    this.testGain = ctx.createGain();
    this.micGain.gain.value = 0;
    this.testGain.gain.value = 0;
    this.micGain.connect(this.inputGain);
    this.testGain.connect(this.inputGain);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.45;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.inputGain.connect(this.analyser);
    this.chainIn = stereoGain(ctx);
    this.inputGain.connect(this.chainIn);
    this.duck = stereoGain(ctx);
    this.master = stereoGain(ctx);
    this.master.gain.value = 0.8;
    this.duck.connect(this.master);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -2.5;
    comp.knee.value = 3;
    comp.ratio.value = 18;
    comp.attack.value = 0.003;
    comp.release.value = 0.1;
    const clip = ctx.createWaveShaper();
    clip.curve = CLIP_CURVE;
    clip.oversample = "2x";
    this.master.connect(comp);
    comp.connect(clip);
    clip.connect(ctx.destination);

    this.shells.drive = makeShell(ctx, "replace");
    this.shells.drive.fx = buildDrive(ctx, this.shells.drive.head, this.shells.drive.wetOut, this.shells.drive.bag);

    this.shells.mod = makeShell(ctx, "replace");
    this.rebuildMod("chorus");

    this.shells.filter = makeShell(ctx, "replace");
    this.shells.filter.fx = buildFilter(ctx, this.shells.filter.head, this.shells.filter.wetOut, this.shells.filter.bag);

    this.shells.delay = makeShell(ctx, "add");
    this.shells.delay.fx = buildDelay(ctx, this.shells.delay.head, this.shells.delay.wetOut, this.shells.delay.bag);

    this.shells.reverb = makeShell(ctx, "add");
    this.buildReverb();

    if (this.workletOk && this.envNode) {
      try {
        this.shells.filter.fx.sense.connect(this.envNode);
        this.envNode.connect(this.shells.filter.fx.filters[0].frequency);
        this.envNode.connect(this.shells.filter.fx.filters[1].frequency);
      } catch (err) {
        this.envNode = null;
      }
    }
    this.follower = createEnvelopeFollower(ctx.sampleRate);
    this.envOut = new Float32Array(this.buf.length);
  }

  buildReverb() {
    const ctx = this.ctx;
    const shell = this.shells.reverb;
    if (this.workletOk) {
      try {
        const node = new AudioWorkletNode(ctx, "reverb-fdn", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        shell.head.connect(node);
        node.connect(shell.wetOut);
        shell.bag.push(node);
        shell.fx = { mode: "worklet", node };
        this.envNode = new AudioWorkletNode(ctx, "envelope-follow");
        this.reverbMode = "worklet";
        return;
      } catch (err) {
        this.workletOk = false;
      }
    }
    const a = ctx.createConvolver();
    const b = ctx.createConvolver();
    const gA = ctx.createGain();
    const gB = ctx.createGain();
    gA.gain.value = 1;
    gB.gain.value = 0;
    shell.head.connect(a);
    shell.head.connect(b);
    a.connect(gA);
    b.connect(gB);
    gA.connect(shell.wetOut);
    gB.connect(shell.wetOut);
    shell.bag.push(a, b, gA, gB);
    shell.fx = { mode: "convolver", a, b, gA, gB, active: 0 };
    this.reverbMode = "convolver";
    this.envNode = null;
  }

  rebuildMod(type) {
    const shell = this.shells.mod;
    stopBag(shell.modBag);
    shell.modBag = [];
    try { shell.head.disconnect(); } catch (err) { /* first build */ }
    const kind = type === "vibrato" ? "vibrato" : type;
    let fx;
    if (kind === "phaser") fx = buildPhaser(this.ctx, shell.head, shell.wetOut, shell.modBag);
    else if (kind === "flanger") fx = buildFlanger(this.ctx, shell.head, shell.wetOut, shell.modBag);
    else if (kind === "tremolo") fx = buildTremolo(this.ctx, shell.head, shell.wetOut, shell.modBag);
    else fx = buildChorus(this.ctx, shell.head, shell.wetOut, shell.modBag, kind === "vibrato" ? "vibrato" : "chorus");
    shell.fx = fx;
    this.modType = type;
  }

  sync(state, duckTypes) {
    this.setInputGain(state.inputGain);
    this.setMaster(state.master);
    for (let i = 0; i < PEDAL_IDS.length; i++) {
      const id = PEDAL_IDS[i];
      this.setPedal(id, state.pedals[id], duckTypes);
    }
    if (this.order.join() !== state.order.join()) this.setOrder(state.order);
  }

  setPedal(id, pedal, duck) {
    if (!this.ctx) return;
    const typeChanged = (id === "mod" && pedal.type !== this.modType)
      || (id === "reverb" && pedal.type !== this.reverbType && this.reverbType !== "")
      || (id === "filter" && pedal.type !== this.filterType && this.filterType !== "");
    const run = () => {
      if (id === "mod" && pedal.type !== this.modType) this.rebuildMod(pedal.type);
      if (id === "reverb") this.reverbType = pedal.type;
      if (id === "filter") this.filterType = pedal.type;
      this.apply(id, pedal);
    };
    if (duck && typeChanged) {
      this.applyBlend(this.shells[id], false, 0);
      clearTimeout(this.typeTimers[id]);
      this.typeTimers[id] = setTimeout(run, 28);
    } else {
      run();
    }
  }

  apply(id, pedal) {
    if (id === "drive") this.applyDrive(pedal);
    else if (id === "mod") this.applyMod(pedal);
    else if (id === "filter") this.applyFilter(pedal);
    else if (id === "delay") this.applyDelay(pedal);
    else if (id === "reverb") this.applyReverb(pedal);
  }

  applyBlend(shell, enabled, mix) {
    const g = blendGains(shell.blend, enabled, mix);
    approach(this.ctx, shell.dry.gain, g.dry, 0.012);
    approach(this.ctx, shell.wet.gain, g.wet, 0.012);
  }

  applyDrive(pedal) {
    const p = pedal.params;
    const fx = this.shells.drive.fx;
    const pre = mapParam("drive", "gain", p.gain);
    const fuzz = mapParam("drive", "fuzz", p.fuzz);
    approach(this.ctx, fx.pre.gain, pre, 0.02);
    for (let i = 0; i < 2; i++) {
      approach(this.ctx, fx.softG[i].gain, 1 - fuzz, 0.02);
      approach(this.ctx, fx.hardG[i].gain, fuzz, 0.02);
      approach(this.ctx, fx.tones[i].frequency, mapParam("drive", "tone", p.tone), 0.03);
    }
    const level = mapParam("drive", "level", p.level) * driveMakeup(pre, fuzz);
    approach(this.ctx, fx.post.gain, level, 0.02);
    this.applyBlend(this.shells.drive, pedal.enabled, p.mix);
  }

  applyMod(pedal) {
    const p = pedal.params;
    const type = pedal.type;
    const fx = this.shells.mod.fx;
    const rate = mapParam("mod", "rate", p.rate, type);
    const depth = mapParam("mod", "depth", p.depth, type);
    const color = mapParam("mod", "color", p.color, type);
    const width = mapParam("mod", "width", p.width, type);
    approach(this.ctx, fx.lfo.frequency, rate, 0.03);
    if (fx.kind === "chorus") {
      for (let i = 0; i < fx.depths.length; i++) approach(this.ctx, fx.depths[i].gain, depth, 0.03);
      for (let i = 0; i < fx.tones.length; i++) approach(this.ctx, fx.tones[i].frequency, color, 0.04);
      const w = clamp01(width);
      approach(this.ctx, fx.pans[0][0].gain, 0.5 + 0.5 * w, 0.03);
      approach(this.ctx, fx.pans[0][1].gain, 0.5 - 0.5 * w, 0.03);
      approach(this.ctx, fx.pans[1][0].gain, 0.5 - 0.5 * w, 0.03);
      approach(this.ctx, fx.pans[1][1].gain, 0.5 + 0.5 * w, 0.03);
    } else if (fx.kind === "flanger") {
      for (let i = 0; i < fx.depths.length; i++) approach(this.ctx, fx.depths[i].gain, depth, 0.03);
      for (let i = 0; i < fx.fbs.length; i++) approach(this.ctx, fx.fbs[i].gain, Math.min(MAX_FLANGER_FEEDBACK, color), 0.03);
    } else if (fx.kind === "phaser") {
      for (let ch = 0; ch < 2; ch++) {
        for (let s = 0; s < fx.depthGains[ch].length; s++) {
          approach(this.ctx, fx.depthGains[ch][s].gain, depth, 0.04);
        }
        approach(this.ctx, fx.fbs[ch].gain, Math.min(MAX_PHASER_FEEDBACK, color), 0.03);
      }
    } else if (fx.kind === "tremolo") {
      const m = depth * 0.5;
      const shape = clamp01(color);
      const w = clamp01(width);
      approach(this.ctx, fx.raw.gain, 1 - shape, 0.03);
      approach(this.ctx, fx.shaped.gain, shape, 0.03);
      approach(this.ctx, fx.depthL.gain, m, 0.03);
      approach(this.ctx, fx.depthR.gain, m * (1 - 2 * w), 0.03);
      approach(this.ctx, fx.gL.gain, 1 - m, 0.03);
      approach(this.ctx, fx.gR.gain, 1 - m, 0.03);
    }
    this.applyBlend(this.shells.mod, pedal.enabled, p.mix);
  }

  applyFilter(pedal) {
    const p = pedal.params;
    const type = pedal.type;
    const fx = this.shells.filter.fx;
    this.liveFilter = pedal;
    const base = mapParam("filter", "freq", p.freq, type);
    const q = mapParam("filter", "resonance", p.resonance, type);
    const biquadType = type === "highpass" ? "highpass" : type === "wah" ? "bandpass" : "lowpass";
    for (let i = 0; i < fx.filters.length; i++) {
      if (fx.filters[i].type !== biquadType) fx.filters[i].type = biquadType;
      approach(this.ctx, fx.filters[i].frequency, base, 0.03);
      approach(this.ctx, fx.filters[i].Q, q, 0.03);
    }
    if (type === "wah") {
      approach(this.ctx, fx.lfo.frequency, 0.2, 0.05);
      approach(this.ctx, fx.lfoDepth.gain, 0, 0.03);
      this.pushEnvelope(p, true);
    } else {
      const rate = mapParam("filter", "rate", p.rate, type);
      const swing = mapParam("filter", "depth", p.depth, type) * base * 0.75;
      approach(this.ctx, fx.lfo.frequency, rate, 0.03);
      approach(this.ctx, fx.lfoDepth.gain, swing, 0.04);
      this.pushEnvelope(p, false);
    }
    this.applyBlend(this.shells.filter, pedal.enabled, p.mix == null ? 1 : p.mix);
  }

  pushEnvelope(params, wah) {
    const depth = wah ? mapParam("filter", "depth", params.depth, "wah") : 0;
    const range = wah ? mapParam("filter", "range", params.freq, "wah") : 0;
    const attack = mapParam("filter", "rate", params.rate, "wah");
    const release = mapParam("filter", "release", params.release == null ? 0.4 : params.release, "wah");
    if (this.envNode) {
      const now = this.ctx.currentTime;
      approach(this.ctx, this.envNode.parameters.get("depth"), depth, 0.03);
      approach(this.ctx, this.envNode.parameters.get("range"), range, 0.03);
      approach(this.ctx, this.envNode.parameters.get("attack"), attack, 0.03);
      approach(this.ctx, this.envNode.parameters.get("release"), release, 0.03);
      this._envAttack = attack;
      this._envRelease = release;
      this._envDepth = depth;
      this._envRange = range;
    } else {
      this._envAttack = attack;
      this._envRelease = release;
      this._envDepth = depth;
      this._envRange = range;
    }
  }

  applyDelay(pedal) {
    const p = pedal.params;
    const fx = this.shells.delay.fx;
    const time = clamp(mapParam("delay", "time", p.time), 0.04, 1);
    const fb = Math.min(MAX_DELAY_FEEDBACK, mapParam("delay", "feedback", p.feedback));
    const tone = mapParam("delay", "tone", p.tone);
    const low = mapParam("delay", "lowCut", p.lowCut);
    const mod = mapParam("delay", "modDepth", p.modDepth);
    const rate = mapParam("delay", "modRate", p.modRate);
    approach(this.ctx, fx.lfo.frequency, rate, 0.05);
    for (let i = 0; i < 2; i++) {
      approach(this.ctx, fx.delays[i].delayTime, time, 0.04);
      approach(this.ctx, fx.fbs[i].gain, fb, 0.03);
      approach(this.ctx, fx.tones[i].frequency, tone, 0.04);
      approach(this.ctx, fx.lows[i].frequency, low, 0.04);
      approach(this.ctx, fx.depths[i].gain, mod, 0.04);
    }
    this.applyBlend(this.shells.delay, pedal.enabled, p.mix);
  }

  applyReverb(pedal) {
    const p = pedal.params;
    const type = pedal.type;
    this.reverbType = type;
    const t60 = mapParam("reverb", "decay", p.decay);
    const cutoff = mapParam("reverb", "tone", p.tone);
    const pre = mapParam("reverb", "predelay", p.predelay);
    const width = mapParam("reverb", "width", p.width);
    const mod = mapParam("reverb", "mod", p.mod);
    const size = mapParam("reverb", "size", p.size);
    const fx = this.shells.reverb.fx;
    if (fx.mode === "worklet") {
      const par = fx.node.parameters;
      const now = this.ctx.currentTime;
      const typeParam = par.get("type");
      typeParam.cancelScheduledValues(now);
      typeParam.setValueAtTime(reverbTypeIndex(type), now);
      approach(this.ctx, par.get("t60"), t60, 0.04);
      approach(this.ctx, par.get("cutoff"), cutoff, 0.04);
      approach(this.ctx, par.get("predelay"), pre, 0.04);
      approach(this.ctx, par.get("width"), width, 0.04);
      approach(this.ctx, par.get("mod"), mod, 0.04);
      approach(this.ctx, par.get("size"), size, 0.08);
    } else {
      this.irParams = { t60, cutoff, predelay: pre, width, mod, size, type };
      clearTimeout(this.irTimer);
      this.irTimer = setTimeout(() => this.swapImpulse(), 70);
    }
    this.applyBlend(this.shells.reverb, pedal.enabled, p.mix);
  }

  swapImpulse() {
    if (!this.irParams || !this.shells.reverb || this.shells.reverb.fx.mode !== "convolver") return;
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const seconds = Math.min(4.5, Math.max(1.2, this.irParams.t60 * 1.15));
    const n = Math.floor(sr * seconds);
    const rev = new ReverbCore(sr);
    rev.setControls(this.irParams);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const block = 128;
    const inp = new Float32Array(block);
    inp[0] = 1;
    for (let i = 0; i < n; i += block) {
      const len = Math.min(block, n - i);
      rev.process(inp.subarray(0, len), L.subarray(i, i + len), R.subarray(i, i + len));
      if (i === 0) inp[0] = 0;
    }
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(L[i]);
      const b = Math.abs(R[i]);
      if (a > peak) peak = a;
      if (b > peak) peak = b;
    }
    const norm = peak > 0.0001 ? 0.85 / peak : 1;
    for (let i = 0; i < n; i++) {
      L[i] *= norm;
      R[i] *= norm;
    }
    const buffer = ctx.createBuffer(2, n, sr);
    buffer.copyToChannel(L, 0);
    buffer.copyToChannel(R, 1);
    const fx = this.shells.reverb.fx;
    const next = fx.active ? 0 : 1;
    const conv = next ? fx.b : fx.a;
    const gain = next ? fx.gB : fx.gA;
    const prev = next ? fx.gA : fx.gB;
    conv.buffer = buffer;
    approach(ctx, gain.gain, 1, 0.03);
    approach(ctx, prev.gain, 0, 0.05);
    fx.active = next;
  }

  setInputGain(value) {
    if (!this.ctx) return;
    approach(this.ctx, this.inputGain.gain, clamp(value, 0, INPUT_GAIN_MAX), 0.02);
  }

  setMaster(value) {
    if (!this.ctx) return;
    approach(this.ctx, this.master.gain, clamp01(value), 0.02);
  }

  setOrder(order) {
    this.order = order.slice();
    if (!this.ctx || !this.duck) return;
    if (!this.running) {
      this.reconnectNow();
      return;
    }
    approach(this.ctx, this.duck.gain, 0, 0.005);
    clearTimeout(this.reTimer);
    this.reTimer = setTimeout(() => {
      this.reconnectNow();
      if (this.ctx) approach(this.ctx, this.duck.gain, 1, 0.012);
    }, 22);
  }

  reconnectNow() {
    try { this.chainIn.disconnect(); } catch (err) { /* fresh */ }
    for (let i = 0; i < PEDAL_IDS.length; i++) {
      try { this.shells[PEDAL_IDS[i]].output.disconnect(); } catch (err) { /* fresh */ }
    }
    let prev = this.chainIn;
    for (let i = 0; i < this.order.length; i++) {
      const shell = this.shells[this.order[i]];
      prev.connect(shell.input);
      prev = shell.output;
    }
    prev.connect(this.duck);
  }

  async applySource(source, deviceId) {
    if (source === "test") {
      this.stopMic();
      approach(this.ctx, this.micGain.gain, 0, 0.015);
      approach(this.ctx, this.testGain.gain, 0.9, 0.02);
      this.startTest();
      return;
    }
    this.stopTest();
    approach(this.ctx, this.testGain.gain, 0, 0.015);
    await this.openMic(deviceId);
    approach(this.ctx, this.micGain.gain, 1, 0.02);
  }

  async openMic(deviceId) {
    const stream = await this.requestMic(deviceId);
    if (this.micNode) {
      try { this.micNode.disconnect(); } catch (err) { /* already */ }
    }
    if (this.micStream) this.micStream.getTracks().forEach((t) => t.stop());
    this.micStream = stream;
    this.micNode = this.ctx.createMediaStreamSource(stream);
    this.micNode.connect(this.micGain);
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices && this.onDevices) {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        this.onDevices(all.filter((d) => d.kind === "audioinput"));
      } catch (err) { /* labels can wait */ }
    }
  }

  async requestMic(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("This browser has no microphone input.");
    }
    const attempts = [];
    const first = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      latency: 0,
    };
    if (deviceId) first.deviceId = { exact: deviceId };
    attempts.push(first);
    const second = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId) second.deviceId = { exact: deviceId };
    attempts.push(second);
    if (deviceId) {
      attempts.push({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      });
    }
    this.attempts = attempts;
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      this.constraints = attempts[i];
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: attempts[i], video: false });
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Microphone permission was blocked.");
  }

  stopMic() {
    if (this.micNode) {
      try { this.micNode.disconnect(); } catch (err) { /* already */ }
      this.micNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  startTest() {
    if (this.testLive) return;
    this.testLive = true;
    this.nextBeat = this.ctx.currentTime + 0.06;
    this.step = 0;
    const loop = () => {
      if (!this.testLive || !this.ctx) return;
      const spb = 60 / 78;
      while (this.nextBeat < this.ctx.currentTime + 0.14) {
        this.fireBeat(this.nextBeat, this.step % 4);
        this.nextBeat += spb;
        this.step++;
      }
      this.testTimer = setTimeout(loop, 25);
    };
    loop();
  }

  stopTest() {
    this.testLive = false;
    clearTimeout(this.testTimer);
    this.testTimer = null;
  }

  fireBeat(time, beat) {
    if (beat === 0) this.strum(time, [82.41, 123.47, 164.81, 207.65, 246.94, 329.63], 0.12);
    else if (beat === 2) this.strum(time, [164.81, 246.94, 329.63], 0.07);
    else this.snare(time);
  }

  strum(time, freqs, vel) {
    for (let i = 0; i < freqs.length; i++) this.pluck(time + i * 0.015, freqs[i], vel * (i < 2 ? 1 : 0.72));
  }

  pluck(time, freq, velocity) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const period = sr / freq;
    const len = Math.max(8, Math.floor(period));
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const delay = ctx.createDelay(1);
    delay.delayTime.setValueAtTime(Math.min(0.9, period / sr), time);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1700 + velocity * 3000, time);
    const fb = ctx.createGain();
    fb.gain.setValueAtTime(freq < 140 ? 0.962 : 0.944, time);
    const out = ctx.createGain();
    out.gain.setValueAtTime(Math.max(0.0002, velocity), time);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 2.15);
    src.connect(delay);
    delay.connect(filter);
    filter.connect(fb);
    fb.connect(delay);
    filter.connect(out);
    out.connect(this.testGain);
    src.start(time);
    src.stop(time + 0.04);
    this.collect(time + 2.35, [src, delay, filter, fb, out]);
  }

  snare(time) {
    const ctx = this.ctx;
    const dur = 0.15;
    const n = Math.max(8, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1850, time);
    bp.Q.setValueAtTime(0.75, time);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(900, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.38, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(175, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.22, time);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(this.testGain);
    osc.connect(og);
    og.connect(this.testGain);
    src.start(time);
    src.stop(time + dur);
    osc.start(time);
    osc.stop(time + 0.1);
    this.collect(time + 0.4, [src, bp, hp, g, osc, og]);
  }

  collect(when, nodes) {
    const ms = Math.max(40, (when - this.ctx.currentTime) * 1000 + 60);
    const timer = setTimeout(() => {
      for (let i = 0; i < nodes.length; i++) {
        try { nodes[i].disconnect(); } catch (err) { /* gone */ }
      }
    }, ms);
    this.noteTimers.push(timer);
    if (this.noteTimers.length > 48) clearTimeout(this.noteTimers.shift());
  }

  tick() {
    if (!this.running || !this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    let peak = 0;
    const buf = this.buf;
    for (let i = 0; i < buf.length; i++) {
      const a = buf[i] < 0 ? -buf[i] : buf[i];
      if (a > peak) peak = a;
      s += buf[i] * buf[i];
    }
    const rms = Math.sqrt(s / buf.length);
    this.meter += (rms - this.meter) * 0.45;
    if (this.meter > this.peakMeter) this.peakMeter = this.meter;
    if (peak > this.displayPeak) this.displayPeak = peak;
    else this.displayPeak *= 0.993;
    if (!this.envNode && this.liveFilter && this.liveFilter.type === "wah" && this.liveFilter.enabled && this._envDepth > 0) {
      this.follower.process(buf, this.envOut, this._envAttack || 0.02, this._envRelease || 0.15, this._envDepth, this._envRange || 0);
      const add = this.envOut[this.envOut.length - 1] || 0;
      const base = mapParam("filter", "freq", this.liveFilter.params.freq, "wah");
      const fx = this.shells.filter.fx;
      approach(this.ctx, fx.filters[0].frequency, base + add, 0.02);
      approach(this.ctx, fx.filters[1].frequency, base + add, 0.02);
    }
    if (this.onMeter) this.onMeter(this.displayPeak || rms);
    this.raf = requestAnimationFrame(() => this.tick());
  }
}

const engine = new Engine();
