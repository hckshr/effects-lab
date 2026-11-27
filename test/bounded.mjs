// Renders every preset offline in Chrome and checks a played note stays bounded and dies away.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const built = spawnSync(process.execPath, ["build.js"], { cwd: root, encoding: "utf8" });
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
  const response = await worker.fetch(new Request("http://127.0.0.1" + req.url, { method: req.method || "GET" }));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port + "/";

const browser = await chromium.launch({
  executablePath: chrome,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__lab && typeof window.__lab.preview === "function");
  const presets = await page.evaluate(() => {
    const names = [];
    document.querySelectorAll("[data-preset]").forEach((b) => names.push(b.dataset.preset));
    return names;
  });
  assert.ok(presets.length >= 5, "presets missing");

  for (const id of presets) {
    for (const taps of [1, 6]) {
      const stats = await page.evaluate(({ id, taps }) => window.__lab.preview(id, taps), { id, taps });
      console.log(id, "taps", taps, JSON.stringify(stats));
      assert.equal(stats.nans, 0, id + " produced NaN");
      assert.ok(stats.peak > 0.01, id + " was silent (" + stats.peak + ")");
      assert.ok(stats.peak < 1.05, id + " peak " + stats.peak);
      assert.ok(stats.tail < 0.05, id + " taps " + taps + " tail " + stats.tail);
      assert.ok(stats.tail < stats.peak * 0.35, id + " did not decay");
    }
  }

  const input = page.locator("#inputSlot .knob");
  assert.equal(await input.evaluate((el) => getComputedStyle(el).touchAction), "manipulation");
  const box = await input.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 110, { steps: 6 });
  await page.mouse.up();
  const moved = await page.evaluate(() => window.__lab.state.inputGain);
  assert.ok(Math.abs(moved - 1) > 0.05, "drag did not change input gain (" + moved + ")");
  await input.dblclick();
  await page.waitForFunction(() => Math.abs(window.__lab.state.inputGain - 1) < 0.001);
  assert.match(await input.locator(".knob-value").innerText(), /0\.0 dB/);
  assert.equal(await input.evaluate((el) => el.classList.contains("flash")), true);

  const decay = page.locator('.pedal[data-id="reverb"] [data-param="decay"]');
  const decayBox = await decay.boundingBox();
  await page.mouse.move(decayBox.x + decayBox.width / 2, decayBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(decayBox.x + decayBox.width / 2, decayBox.y + 90, { steps: 6 });
  await page.mouse.up();
  await decay.dblclick();
  const decayDefault = await page.evaluate(() => window.__lab.defaultKnob("reverb", "decay"));
  await page.waitForFunction((value) => Math.abs(window.__lab.state.pedals.reverb.params.decay - value) < 0.001, decayDefault);
  assert.equal(await decay.evaluate((el) => el.classList.contains("flash")), true);

  const phonePath = "/opt/cursor/artifacts/effects_lab_stable_phone.png";
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  await page.screenshot({ path: phonePath, fullPage: true });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("bounded ok", phonePath);
  await browser.close();
  server.close();
} catch (err) {
  console.error("PAGE", errors);
  await browser.close();
  server.close();
  throw err;
}
