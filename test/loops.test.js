import test from "node:test";
import assert from "node:assert/strict";
import { LOOPS, bufferLoops, loopSeconds, renderLoop } from "../src/loops.js";

test("library loops are original, named, and seamless", () => {
  assert.ok(bufferLoops().length >= 7);
  assert.ok(LOOPS.some((loop) => loop.kind === "notes" && loop.name === "Test notes"));
  const seconds = loopSeconds();
  assert.ok(Math.abs(seconds - 5) < 1e-9);
  for (const loop of bufferLoops()) {
    assert.ok(loop.name.length > 2);
    assert.ok(loop.hint.length > loop.name.length / 2);
    assert.equal(loop.hint.includes("\n"), false);
    const audio = renderLoop(loop.id, 48000);
    assert.equal(audio.length, Math.round(48000 * seconds));
    let peak = 0;
    for (let i = 0; i < audio.length; i++) {
      assert.equal(Number.isFinite(audio[i]), true);
      const a = audio[i] < 0 ? -audio[i] : audio[i];
      if (a > peak) peak = a;
    }
    assert.ok(peak > 0.2 && peak < 0.5, loop.id + " peak " + peak);
    if (loop.id === "keys") {
      const jump = Math.abs(audio[0] - audio[audio.length - 1]);
      assert.ok(jump < 0.02, loop.id + " loop jump " + jump);
    } else {
      const tail = audio.subarray(audio.length - Math.round(48000 * 0.03));
      let tailPeak = 0;
      for (let i = 0; i < tail.length; i++) {
        const a = tail[i] < 0 ? -tail[i] : tail[i];
        if (a > tailPeak) tailPeak = a;
      }
      assert.ok(tailPeak < 0.02, loop.id + " tail " + tailPeak);
    }
  }
});
