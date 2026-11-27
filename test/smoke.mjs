import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const root = path.dirname(fileURLToPath(import.meta.url));
const built = spawnSync(process.execPath, ["build.js"], { cwd: path.join(root, ".."), encoding: "utf8" });
if (built.status !== 0) {
  console.error(built.stdout);
  console.error(built.stderr);
  process.exit(built.status || 1);
}
const worker = (await import("../worker.js")).default;

const chrome = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("google-chrome not found");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = "http://127.0.0.1" + req.url;
  const response = await worker.fetch(new Request(url, { method: req.method || "GET" }));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = "http://127.0.0.1:" + port + "/";
const artifacts = process.env.ARTIFACTS || "/opt/cursor/artifacts";
fs.mkdirSync(artifacts, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: chrome,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});

function watch(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
}

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ["microphone"],
  });
  await context.addInitScript(() => {
    window.__gumCalls = [];
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints) => {
      window.__gumCalls.push(constraints);
      return orig(constraints);
    };
  });
  const page = await context.newPage();
  watch(page);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  assert.equal(await page.title(), "Effects Lab");
  assert.match(await page.locator("#appTitle").innerText(), /Effects Lab/);
  assert.match(await page.locator("#tip").innerText(), /mic is only on while you record/i);
  assert.equal(await page.locator("#start").count(), 0);
  assert.equal(await page.locator("#useGuitar").count(), 0);
  assert.match(await page.locator("#library h2").innerText(), /Loop library/);
  assert.equal(await page.locator("#loopList .loop").count(), 8);
  const chord = page.locator('[data-loop="chords"]');
  assert.match(await chord.locator("h3").innerText(), /Clean chords/);
  assert.match(await chord.locator("p").innerText(), /reverb/i);
  const play = chord.locator('[data-act="play"]');
  const box = await play.boundingBox();
  assert.ok(box.height >= 52, "play button is " + box.height);
  assert.equal(await page.evaluate(() => window.__gumCalls.length), 0);
  const libraryPath = path.join(artifacts, "effects_lab_library_phone.png");
  await page.screenshot({ path: libraryPath });

  await play.click();
  await page.waitForFunction(() => window.__lab && window.__lab.contextState === "running");
  await page.waitForFunction(() => window.__lab.peakMeter > 0.004, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__gumCalls.length), 0);
  const mode = await page.evaluate(() => window.__lab.reverbMode);
  assert.ok(mode === "worklet" || mode === "convolver", mode);

  await page.locator('[data-loop="notes"] [data-act="play"]').click();
  await page.locator("#notePlayer").waitFor({ state: "visible" });
  assert.equal(await page.locator("#playNote").innerText(), "Play note");
  assert.match(await page.locator('[data-sound="pluck"] .choice-name').innerText(), /Single note/);
  assert.equal(await page.evaluate(() => window.__gumCalls.length), 0);

  await page.locator('[data-preset="ambient"]').click();
  await page.waitForFunction(() => /Chorus/.test(document.getElementById("chainLabel").textContent)
    && /Delay/.test(document.getElementById("chainLabel").textContent)
    && /Hall/.test(document.getElementById("chainLabel").textContent));
  const reverb = page.locator('.pedal[data-id="reverb"]');
  await reverb.locator(".more-btn").click();
  await reverb.locator('[data-param="width"]').waitFor();
  await page.locator('[data-preset="ambient"]').click();
  const stomp = page.locator('.pedal[data-id="delay"] .stomp');
  await stomp.click();
  assert.equal(await stomp.getAttribute("aria-pressed"), "false");
  await stomp.click();
  assert.equal(await stomp.getAttribute("aria-pressed"), "true");
  await page.locator('.pedal[data-id="delay"] .nudge[data-dir="-1"]').click();
  await page.waitForFunction(() => document.getElementById("chainLabel").textContent.startsWith("Delay"));

  await page.locator("#recordBtn").click();
  await page.waitForFunction(() => window.__lab.recording && window.__lab.outputConnected === false && window.__gumCalls.length === 1);
  const attempt = await page.evaluate(() => window.__gumCalls[0].audio);
  assert.equal(attempt.echoCancellation, false);
  assert.equal(attempt.noiseSuppression, false);
  assert.equal(attempt.autoGainControl, false);
  assert.equal(attempt.latency, 0);
  await page.waitForFunction(() => window.__lab.recordedSamples > 0, null, { timeout: 4000 });
  assert.equal(await page.evaluate(() => window.__lab.outputConnected), false);
  assert.equal(await page.locator("#stopRecord").isVisible(), true);
  await page.waitForTimeout(500);
  await page.locator("#stopRecord").click();
  await page.waitForFunction(() => !window.__lab.recording && !document.getElementById("takeCard").hidden);
  assert.equal(await page.evaluate(() => window.__lab.micLive), false);
  assert.equal(await page.evaluate(() => window.__lab.outputConnected), true);
  assert.equal(await page.evaluate(() => window.__gumCalls.length), 1);
  await page.locator("#playTake").click();
  await page.locator("#takeCard").scrollIntoViewIfNeeded();
  const takePath = path.join(artifacts, "effects_lab_take_phone.png");
  await page.screenshot({ path: takePath });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__gumCalls.length), 0);
  assert.equal(await page.evaluate(() => window.__lab.recording), false);
  assert.equal(await page.locator("#takeCard").isVisible(), true);

  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("smoke ok", mode, libraryPath, takePath);
  await browser.close();
  server.close();
} catch (err) {
  console.error("CONSOLE", errors);
  await browser.close();
  server.close();
  throw err;
}
