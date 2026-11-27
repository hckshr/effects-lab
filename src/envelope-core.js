// Sample-by-sample envelope follower. Used by the AudioWorklet and by tests.

export function createEnvelopeFollower(sampleRate) {
  let env = 0;
  return {
    reset() {
      env = 0;
    },
    get env() {
      return env;
    },
    process(input, output, attackSec, releaseSec, depth, rangeHz) {
      const n = output.length;
      const a = 1 - Math.exp(-1 / (sampleRate * Math.max(0.001, attackSec)));
      const r = 1 - Math.exp(-1 / (sampleRate * Math.max(0.005, releaseSec)));
      const d = depth > 0 ? depth : 0;
      const range = rangeHz > 0 ? rangeHz : 0;
      for (let i = 0; i < n; i++) {
        const s = Math.abs(input[i] || 0);
        const c = s > env ? a : r;
        env += c * (s - env);
        const shaped = Math.pow(Math.min(1, env * 3.5), 0.8);
        output[i] = shaped * d * range;
      }
    },
  };
}
