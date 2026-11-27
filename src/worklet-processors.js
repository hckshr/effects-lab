// AudioWorklet processors. Loaded with reverb-core.js and envelope-core.js.

const REVERB_TYPE_NAMES = ["room", "hall", "spring", "plate"];

class ReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super({ numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.core = new ReverbCore(sampleRate);
    this.zero = new Float32Array(128);
    this.mix = new Float32Array(128);
    this.port.onmessage = (event) => {
      if (event.data === "clear") this.core.clear();
    };
  }

  static get parameterDescriptors() {
    return [
      { name: "t60", defaultValue: 1.4, minValue: 0.2, maxValue: 8, automationRate: "k-rate" },
      { name: "cutoff", defaultValue: 4000, minValue: 200, maxValue: 14000, automationRate: "k-rate" },
      { name: "predelay", defaultValue: 0.02, minValue: 0, maxValue: 0.12, automationRate: "k-rate" },
      { name: "width", defaultValue: 0.9, minValue: 0, maxValue: 1.2, automationRate: "k-rate" },
      { name: "mod", defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "size", defaultValue: 1, minValue: 0.7, maxValue: 1.4, automationRate: "k-rate" },
      { name: "type", defaultValue: 0, minValue: 0, maxValue: 3, automationRate: "k-rate" },
    ];
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const n = output[0].length;
    if (this.zero.length !== n) {
      this.zero = new Float32Array(n);
      this.mix = new Float32Array(n);
    }
    let src = this.zero;
    const chs = inputs[0];
    if (chs && chs[0] && chs[0].length === n) {
      if (chs[1] && chs[1].length === n) {
        const a = chs[0];
        const b = chs[1];
        const mix = this.mix;
        for (let i = 0; i < n; i++) mix[i] = 0.5 * (a[i] + b[i]);
        src = mix;
      } else {
        src = chs[0];
      }
    } else {
      this.zero.fill(0);
    }
    const typeIndex = parameters.type[0] | 0;
    this.core.setControls({
      t60: parameters.t60[0],
      cutoff: parameters.cutoff[0],
      predelay: parameters.predelay[0],
      width: parameters.width[0],
      mod: parameters.mod[0],
      size: parameters.size[0],
      type: REVERB_TYPE_NAMES[typeIndex] || "room",
    });
    const right = output[1] || output[0];
    this.core.process(src, output[0], right);
    return true;
  }
}

class EnvelopeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.follower = createEnvelopeFollower(sampleRate);
    this.zero = new Float32Array(128);
  }

  static get parameterDescriptors() {
    return [
      { name: "attack", defaultValue: 0.02, minValue: 0.001, maxValue: 0.2, automationRate: "k-rate" },
      { name: "release", defaultValue: 0.15, minValue: 0.02, maxValue: 0.8, automationRate: "k-rate" },
      { name: "depth", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "range", defaultValue: 1800, minValue: 0, maxValue: 6000, automationRate: "k-rate" },
    ];
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    if (this.zero.length !== out.length) this.zero = new Float32Array(out.length);
    let src = this.zero;
    const chs = inputs[0];
    if (chs && chs[0] && chs[0].length === out.length) src = chs[0];
    else this.zero.fill(0);
    this.follower.process(src, out, parameters.attack[0], parameters.release[0], parameters.depth[0], parameters.range[0]);
    return true;
  }
}

registerProcessor("reverb-fdn", ReverbProcessor);
registerProcessor("envelope-follow", EnvelopeProcessor);
