import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createTakeRecorder, trimTake, TAKE_PREROLL_SEC, TAKE_MAX_SEC } from "../src/takes.js";

test("a take keeps a short pre-roll and trims the silence", () => {
  const sr = 1000;
  const samples = new Float32Array(3000);
  for (let i = 1000; i < 1600; i++) samples[i] = 0.2;
  const trimmed = trimTake(samples, sr, { preroll: TAKE_PREROLL_SEC, tail: 0.2, startRms: 0.015 });
  assert.ok(Math.abs(trimmed.lead - TAKE_PREROLL_SEC) < 0.02);
  assert.ok(trimmed.audio.length < samples.length);
  let peakAt = 0;
  let peak = 0;
  for (let i = 0; i < trimmed.audio.length; i++) {
    const a = Math.abs(trimmed.audio[i]);
    if (a > peak) { peak = a; peakAt = i; }
  }
  assert.ok(peakAt > sr * 0.2, "the note was clipped");
});

test("recording stops on silence or at one minute, and only after you have played", () => {
  const sr = 1000;
  const quiet = createTakeRecorder(sr, { stopSec: 0.2, maxSec: 2, startRms: 0.05 });
  assert.equal(quiet.push(new Float32Array(500)), null);
  assert.equal(quiet.heard, false);
  const loud = new Float32Array(100);
  loud.fill(0.2);
  assert.equal(quiet.push(loud), null);
  assert.equal(quiet.heard, true);
  assert.equal(quiet.push(new Float32Array(250)), "silence");
  const take = quiet.finish("silence");
  assert.equal(take.reason, "silence");
  assert.ok(take.lead > 0.05);
  assert.equal(take.loop, true);

  const capped = createTakeRecorder(sr, { maxSec: 0.3, stopSec: 5, startRms: 0.5 });
  const noise = new Float32Array(200);
  noise.fill(0.01);
  assert.equal(capped.push(noise), null);
  assert.equal(capped.push(noise), "max");
  assert.equal(TAKE_MAX_SEC, 60);
});

test("the microphone is requested only while a take is recording", () => {
  const engine = fs.readFileSync("src/engine.js", "utf8");
  const ui = fs.readFileSync("src/ui.js", "utf8");
  assert.equal((engine.match(/getUserMedia/g) || []).length, 2);
  assert.equal((engine.match(/requestMic\(/g) || []).length, 2);
  assert.equal((ui.match(/getUserMedia/g) || []).length, 0);
  assert.match(engine, /setSpeakers\(false\)/);
  assert.doesNotMatch(engine, /micGain|useGuitar/);
  assert.doesNotMatch(engine, /micNode\.connect\(this\.ctx\.destination\)/);
  assert.doesNotMatch(engine, /recNode\.connect\(this\.ctx\.destination\)/);
  assert.match(engine, /createMediaStreamDestination/);
});
