# Effects Lab

A guitar pedalboard that runs in the browser. Play a built-in loop, or record a short take, and hear drive, modulation, filter, delay, and reverb while you turn the knobs. The microphone is never monitored live.

**Try it:** [effects-lab.hckshr.workers.dev](https://effects-lab.hckshr.workers.dev/)

The name on the page comes from `APP_CONFIG.name` in `src/config.js`. Change that and run `node build.js` to rename the app. The Worker name (`effects-lab`) and the live host stay in `wrangler.toml`.

## How to use it

1. Open the **Loop library** and tap **Play** on a loop. Loop is on, so it repeats while you turn knobs. The microphone stays off. Double-tap a knob to put it back to its default (Input returns to 0 dB).
2. **Test notes** is in the library if you want one note, a chord, or a held tone instead of a loop.
3. Tap **Record** under **Record my guitar**, play, then tap **Stop**. It also stops if you pause, and it never runs past a minute. A short bit of audio before the first note is kept. Nothing is sent to the speakers while you record, so the guitar cannot feed back. After you stop, the take loops through the pedals. Trim the start and end, or tap **Re-record**. The last take is saved on this device.
4. Stomp a pedal on, turn its knobs, and use **More** for the extra controls. **Add** puts a pedal on the board. Drag a pedal by its name, or use the arrows, to change the order. The chain runs into the next pedal, left to right on a wide screen and top to bottom on a phone.

The loops are synthesized in `src/loops.js`. Sources and the license are in `licenses/LOOPS.txt`.

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
