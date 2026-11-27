import test from "node:test";
import assert from "node:assert/strict";
import {
  DOUBLE_TAP_MS,
  MAX_DELAY_FEEDBACK,
  MAX_FLANGER_FEEDBACK,
  MAX_PHASER_FEEDBACK,
  INPUT_GAIN_MAX,
  PEDAL_IDS,
  PRESETS,
  applyPreset,
  blendGains,
  chainText,
  clamp01,
  defaultKnobPosition,
  knobNudge,
  knobRepeatDelay,
  knobStep,
  driveMakeup,
  isDoubleTap,
  formatGainDb,
  freshState,
  hydrate,
  initialState,
  knobFromDelaySeconds,
  logMap,
  logUnmap,
  majorChordFrequencies,
  makeHardCurve,
  makeSafetyCurve,
  makeSoftCurve,
  mapParam,
  meterPercent,
  moveItem,
  noteFrequency,
  reorder,
  REPEAT_COPY,
  serialize,
  storageKeyFor,
  TEST_SOUND_COPY,
  TEST_SOUNDS,
} from "../src/dsp.js";
import { loopGainForDelay, MAX_REVERB_LOOP, fillDelaySamples } from "../src/reverb-core.js";

test("storage key follows the display name", () => {
  assert.equal(storageKeyFor("Effects Lab"), "effects-lab:v1");
});

test("step size, hold acceleration, and knob defaults", () => {
  assert.equal(knobStep("global", "input"), 0.04);
  assert.equal(knobStep("delay", "time"), 0.04);
  assert.equal(knobStep("reverb", "decay"), 0.05);
  assert.ok(knobStep("reverb", "mix") >= 0.04 && knobStep("reverb", "mix") <= 0.08);
  const unity = defaultKnobPosition("global", "input");
  const once = knobNudge(unity, "global", "input", 1, 0);
  assert.ok(once - unity > 0.03 && once - unity < 0.06);
  assert.ok(knobNudge(unity, "global", "input", 1, 8) - unity > (once - unity) * 1.5);
  assert.equal(knobNudge(1, "reverb", "mix", 1, 0), 1);
  assert.equal(knobNudge(0, "reverb", "mix", -1, 12), 0);
  assert.ok(knobRepeatDelay(0) > knobRepeatDelay(6));
  assert.ok(knobRepeatDelay(12) >= 45);
  let pos = 0;
  let taps = 0;
  while (pos < 1 && taps < 40) {
    pos = knobNudge(pos, "reverb", "decay", 1, 0);
    taps += 1;
  }
  assert.ok(taps >= 10 && taps <= 30, "full range took " + taps + " taps");
  assert.equal(isDoubleTap(0, 100), false);
  assert.equal(isDoubleTap(1000, 1200), true);
  assert.equal(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS + 5), false);
  assert.ok(Math.abs(defaultKnobPosition("global", "input") * 3 - 1) < 1e-9);
  assert.equal(defaultKnobPosition("global", "master"), 0.8);
  assert.equal(defaultKnobPosition("reverb", "decay"), 0.4);
  const saved = serialize(initialState());
  assert.equal(saved.v, 3);
  saved.pedals.delay.params.feedback = 4;
  saved.inputGain = 99;
  const back = hydrate(saved);
  assert.ok(back.pedals.delay.params.feedback <= 1);
  assert.ok(back.inputGain <= 3);
});

test("test sounds use plain names and a one-line hint", () => {
  assert.deepEqual(TEST_SOUNDS, ["pluck", "chord", "tone", "loop"]);
  assert.deepEqual(TEST_SOUND_COPY.pluck, {
    label: "Single note",
    hint: "One guitar-like note; hear the reverb/delay tail",
  });
  assert.deepEqual(TEST_SOUND_COPY.chord, { label: "Chord", hint: "Strummed chord" });
  assert.deepEqual(TEST_SOUND_COPY.tone, {
    label: "Held note",
    hint: "Steady note; good for chorus/tremolo",
  });
  assert.deepEqual(TEST_SOUND_COPY.loop, {
    label: "Riff",
    hint: "Repeating note + snare pattern",
  });
  assert.deepEqual(REPEAT_COPY, {
    label: "Auto-replay",
    hint: "Replays every couple of seconds so you can tweak knobs hands-free",
  });
  const copies = TEST_SOUNDS.map((id) => TEST_SOUND_COPY[id]).concat([REPEAT_COPY]);
  for (const copy of copies) {
    assert.equal(copy.hint.includes("\n"), false);
    assert.ok(copy.label.length > 0 && copy.hint.length > copy.label.length / 2);
  }
});

test("first load is the loop library, not the microphone", () => {
  const state = initialState();
  assert.equal(state.source, "library");
  assert.equal(state.player.note, "C");
  assert.equal(state.player.octave, 3);
  assert.equal(state.player.sound, "pluck");
  assert.equal(state.player.repeat, false);
  assert.ok(Math.abs(noteFrequency("A", 4) - 440) < 0.001);
  assert.ok(Math.abs(noteFrequency("C", 4) - 261.6256) < 0.01);
  assert.ok(Math.abs(noteFrequency("C", 3) - 130.8128) < 0.01);
  const chord = majorChordFrequencies(noteFrequency("C", 3));
  assert.equal(chord.length, 4);
  assert.ok(chord[1] / chord[0] > 1.2 && chord[1] / chord[0] < 1.3);
  assert.ok(chord[3] / chord[0] > 1.9 && chord[3] / chord[0] < 2.1);
  assert.equal(hydrate({}).source, "library");
  assert.equal(hydrate({ source: "guitar" }).source, "library");
});

test("delay time is a capped log sweep and feedback cannot run away", () => {
  let prev = 0;
  for (let k = 0; k <= 1; k += 0.05) {
    const time = mapParam("delay", "time", k);
    const fb = mapParam("delay", "feedback", k);
    assert.ok(time + 1e-12 >= prev);
    assert.ok(time >= 0.04 - 1e-9 && time <= 1 + 1e-9);
    assert.ok(fb >= 0 && fb <= MAX_DELAY_FEEDBACK);
    prev = time;
  }
  assert.ok(mapParam("delay", "feedback", 1) <= MAX_DELAY_FEEDBACK);
  assert.ok(mapParam("delay", "feedback", 1) > 0.6);
  assert.ok(mapParam("delay", "feedback", 1) < 0.9);
  assert.ok(mapParam("mod", "color", 1, "flanger") <= MAX_FLANGER_FEEDBACK);
  assert.ok(mapParam("mod", "color", 1, "phaser") <= MAX_PHASER_FEEDBACK);
  assert.ok(Math.abs(knobFromDelaySeconds(mapParam("delay", "time", 0.42)) - 0.42) < 1e-6);
  assert.ok(Math.abs(logUnmap(logMap(0.37, 20, 2000), 20, 2000) - 0.37) < 1e-6);
});

test("replace blend keeps power, bypass is dry", () => {
  for (const mix of [0, 0.25, 0.5, 0.8, 1]) {
    const g = blendGains("replace", true, mix);
    assert.ok(Math.abs(g.dry * g.dry + g.wet * g.wet - 1) < 1e-9);
  }
  const off = blendGains("add", false, 0.9);
  assert.deepEqual(off, { dry: 1, wet: 0 });
  const added = blendGains("add", true, 0.35);
  assert.equal(added.dry, 1);
  assert.equal(added.wet, 0.35);
});

test("drive curve stays in range and the soft curve is odd and monotonic", () => {
  const soft = makeSoftCurve();
  assert.equal(soft.length % 2, 1);
  for (let i = 1; i < soft.length; i++) assert.ok(soft[i] >= soft[i - 1] - 1e-7);
  assert.ok(Math.abs(soft[0] + soft[soft.length - 1]) < 1e-6);
  assert.ok(Math.abs(soft[(soft.length - 1) / 2]) < 1e-6);
  for (const x of makeHardCurve()) assert.ok(x >= -1 && x <= 1);
  for (const x of makeSafetyCurve()) assert.ok(Math.abs(x) <= 1 + 1e-6);
  const makeup = driveMakeup(mapParam("drive", "gain", 0.4), 0.2);
  assert.ok(makeup > 0 && makeup < 8);
});

test("presets combine the right pedals and stay inside safe ranges", () => {
  const surf = applyPreset(freshState(), "surf");
  assert.deepEqual(surf.order, ["mod", "reverb"]);
  assert.equal(surf.pedals.mod.type, "tremolo");
  assert.equal(surf.pedals.reverb.type, "spring");
  assert.equal(surf.pedals.drive.onBoard, false);
  const tremRate = mapParam("mod", "rate", surf.pedals.mod.params.rate, "tremolo");
  assert.ok(tremRate > 4 && tremRate < 7, tremRate);

  const ambient = applyPreset(freshState(), "ambient");
  assert.deepEqual(ambient.order, ["mod", "delay", "reverb"]);
  assert.equal(ambient.pedals.mod.type, "chorus");
  assert.equal(ambient.pedals.reverb.type, "hall");
  assert.equal(chainText(ambient), "Chorus → Delay → Hall");
  assert.ok(mapParam("delay", "feedback", ambient.pedals.delay.params.feedback) <= MAX_DELAY_FEEDBACK);

  const slap = applyPreset(freshState(), "slapback");
  const slapMs = mapParam("delay", "time", slap.pedals.delay.params.time) * 1000;
  assert.ok(slapMs > 70 && slapMs < 160, slapMs);
  assert.equal(chainText(slap), "Delay");

  const room = initialState();
  assert.equal(room.preset, "clean-room");
  assert.deepEqual(room.order, ["reverb"]);
  assert.equal(room.pedals.reverb.type, "room");
  assert.equal(room.pedals.reverb.enabled, true);

  for (const preset of PRESETS) {
    const state = applyPreset(freshState(), preset.id);
    assert.deepEqual(state.order, preset.order);
    for (const id of state.order) {
      assert.equal(state.pedals[id].enabled, true);
      assert.equal(state.pedals[id].onBoard, true);
      for (const value of Object.values(state.pedals[id].params)) {
        assert.ok(value >= 0 && value <= 1);
      }
    }
    for (const id of PEDAL_IDS) {
      if (state.order.includes(id)) continue;
      assert.equal(state.pedals[id].enabled, false);
    }
    if (state.pedals.reverb.onBoard) {
      const t60 = mapParam("reverb", "decay", state.pedals.reverb.params.decay);
      const size = mapParam("reverb", "size", state.pedals.reverb.params.size);
      const delays = fillDelaySamples(state.pedals.reverb.type, size, 48000, new Float64Array(8));
      for (const samples of delays) {
        const g = loopGainForDelay(samples, 48000, t60);
        assert.ok(g <= MAX_REVERB_LOOP);
      }
    }
  }
});

test("chain reorder and hydrate ignore garbage", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.deepEqual(reorder(["mod", "delay", "reverb"], "reverb", 0), ["reverb", "mod", "delay"]);

  const ambient = applyPreset(freshState(), "ambient");
  ambient.inputGain = 1.4;
  ambient.master = 0.6;
  ambient.source = "test";
  const raw = serialize(ambient);
  raw.pedals.delay.params.feedback = 9;
  raw.pedals.mod.type = "evil";
  raw.order = ["delay", "delay", "nope", "mod"];
  raw.inputGain = 99;
  const back = hydrate(raw);
  assert.ok(back.pedals.delay.params.feedback <= 1);
  assert.equal(back.pedals.mod.type, "chorus");
  assert.deepEqual(back.order, ["delay", "mod"]);
  assert.equal(back.pedals.reverb.onBoard, false);
  assert.equal(back.pedals.reverb.enabled, false);
  assert.equal(back.inputGain, INPUT_GAIN_MAX);
  assert.equal(back.source, "library");
  assert.equal(back.master, 0.6);
  const again = hydrate(serialize(back));
  assert.deepEqual(again.order, back.order);
  assert.equal(again.pedals.delay.params.time, back.pedals.delay.params.time);
  assert.deepEqual(hydrate(null).order, ["reverb"]);
  assert.equal(clamp01(2), 1);
  assert.equal(meterPercent(0), 0);
  assert.equal(meterPercent(1), 1);
  assert.equal(formatGainDb(1), "+0.0 dB");
  assert.equal(formatGainDb(0), "Off");
});
