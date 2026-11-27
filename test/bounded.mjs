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

  const loops = await page.evaluate(() => window.__lab.loops.filter((loop) => loop.kind === "buffer").map((loop) => loop.id));
  assert.ok(loops.length >= 7, "library loops missing");
  for (const id of presets) {
    for (const loopId of loops) {
      const stats = await page.evaluate(({ id, loopId }) => window.__lab.preview(id, loopId), { id, loopId });
      console.log(id, loopId, JSON.stringify(stats));
      assert.equal(stats.nans, 0, id + " " + loopId + " produced NaN");
      assert.ok(stats.peak > 0.01, id + " " + loopId + " was silent (" + stats.peak + ")");
      assert.ok(stats.peak < 1.05, id + " " + loopId + " peak " + stats.peak);
      assert.ok(stats.tail <= stats.peak + 1e-4, id + " " + loopId + " tail exceeded the peak");
    }
  }

  const input = page.locator("#inputSlot .knob");
  await input.scrollIntoViewIfNeeded();
  const plus = input.locator('[data-step="1"]');
  const plusBox = await plus.boundingBox();
  assert.ok(plusBox.height >= 44, "plus is " + plusBox.height);
  assert.equal(await plus.evaluate((el) => getComputedStyle(el).touchAction), "manipulation");
  const before = await page.evaluate(() => window.__lab.state.inputGain);
  await plus.click();
  const moved = await page.evaluate(() => window.__lab.state.inputGain);
  assert.ok(moved > before + 0.05, "plus did not raise input gain (" + moved + ")");
  await input.locator('[data-step="0"]').click();
  await page.waitForFunction(() => Math.abs(window.__lab.state.inputGain - 1) < 0.001);
  assert.match(await input.locator(".knob-value").innerText(), /0\.0 dB/);
  assert.equal(await input.evaluate((el) => el.classList.contains("flash")), true);

  const decay = page.locator('.pedal[data-id="reverb"] [data-param="decay"]');
  await decay.scrollIntoViewIfNeeded();
  await decay.locator('[data-step="1"]').click();
  await decay.locator('[data-step="0"]').click();
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
