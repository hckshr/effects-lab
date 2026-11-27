# Effects Lab

A guitar pedalboard that runs in the browser. Plug in with an audio interface or the phone mic, or play the built-in test sound, and hear drive, modulation, filter, delay, and reverb while you turn the knobs.

**Try it:** [effects-lab.hckshr.workers.dev](https://effects-lab.hckshr.workers.dev/)

The name on the page comes from `APP_CONFIG.name` in `src/config.js`. Change that and run `node build.js` to rename the app. The Worker name (`effects-lab`) and the live host stay in `wrangler.toml`.

## How to use it

1. Tap **Play note**. You hear a plucked C through the pedals. The microphone stays off.
2. Pick another note, an octave, and a sound: one pluck, a major chord, a held tone, or the pluck-and-snare loop. **Repeat** plays it again every couple of seconds. Hold **Play note** while Tone is selected to keep the note going.
3. Tap **Use my guitar** only when you want to play through an input. That is when the page asks for the microphone. Pick the input if you have more than one. Echo cancellation, noise suppression, and auto gain are off, and low latency is requested, so the guitar stays direct.
4. Wear headphones if you are using the phone mic. Otherwise the speaker feeds back into the mic.
5. Stomp a pedal on, turn its knobs, and use **More** for the extra controls. **Add** puts a pedal on the board. Drag a pedal by its name, or use the arrows, to change the order. The chain runs into the next pedal, left to right on a wide screen and top to bottom on a phone.

Each pedal's main knobs:

| Pedal | Knobs | Also |
|---|---|---|
| Drive | Gain, Tone, Level | Blend and Fuzz under More |
| Modulation | Rate, Depth, Mix, and Tone / Feedback / Shape | Chorus, Phaser, Flanger, Tremolo, Vibrato |
| Filter | Freq or Range, Reso, Depth or Sweep, Rate or Attack | Auto-wah, low pass, high pass |
| Delay | Time, Feedback, Mix, Tone | Tap tempo, plus wow, flutter, and low cut |
| Reverb | Decay, Mix, Tone, Pre-delay | Room, Hall, Spring, Plate |

Feedback on the delay, flanger, and phaser is capped, and the reverb tank is capped the same way. A limiter and a soft clip sit on the output. Knob moves are smoothed so they don't click.

The last setup is stored on the device. Presets replace the board:

- **Clean Room** — a short room
- **Surf Spring** — tremolo into a spring
- **Big Hall** — a long hall
- **Slapback** — a single short repeat
- **Ambient Wash** — chorus into delay into a hall
- **Crunch** — light drive and a small room
- **Wah Funk** — auto-wah and a little delay

## Build and deploy

```sh
node build.js          # writes index.html and worker.js from src/
npx wrangler deploy    # publish to Cloudflare Workers
```

`npm test` builds and runs the DSP checks. `npm run smoke` loads the page in headless Chrome, plays a test note without opening the microphone, and checks that the console stays quiet.

The reverb is an 8-delay feedback network in an AudioWorklet (a generated impulse through a ConvolverNode if the worklet cannot load). The other pedals are ordinary Web Audio nodes.
