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
  const page = await context.newPage();
  watch(page);
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.title(), "Effects Lab");
  assert.match(await page.locator("#appTitle").innerText(), /Effects Lab/);
  assert.match(await page.locator("#tip").innerText(), /headphones/i);
  assert.match(await page.locator("#tip").innerText(), /phone mic/i);
  assert.match(await page.locator("#chainLabel").innerText(), /Room/);

  await page.locator("#start").click();
  await page.waitForFunction(() => window.__lab && window.__lab.contextState === "running");
  const attempt = await page.evaluate(() => window.__lab.attempts[0]);
  assert.equal(attempt.echoCancellation, false);
  assert.equal(attempt.noiseSuppression, false);
  assert.equal(attempt.autoGainControl, false);
  assert.equal(attempt.latency, 0);
  const used = await page.evaluate(() => window.__lab.constraints);
  assert.equal(used.echoCancellation, false);
  assert.equal(used.noiseSuppression, false);
  assert.equal(used.autoGainControl, false);

  await page.locator('[data-source="test"]').click();
  await page.waitForFunction(() => window.__lab.peakMeter > 0.004, null, { timeout: 5000 });
  const mode = await page.evaluate(() => window.__lab.reverbMode);
  assert.ok(mode === "worklet" || mode === "convolver", mode);

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
  await page.locator('[data-preset="ambient"]').click();

  await page.locator('[data-preset="slapback"]').click();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("chainLabel").textContent === "Delay");

  await page.locator("#start").click();
  await page.waitForFunction(() => window.__lab.contextState === "running");
  await page.locator('[data-source="test"]').click();
  await page.locator('[data-preset="ambient"]').click();
  await page.waitForFunction(() => window.__lab.peakMeter > 0.004, null, { timeout: 5000 });
  await page.waitForFunction(() => Number(document.getElementById("meter").getAttribute("aria-valuenow")) > 18, null, { timeout: 4000 });

  const phonePath = path.join(artifacts, "effects_lab_phone.png");
  await page.screenshot({ path: phonePath, fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => Number(document.getElementById("meter").getAttribute("aria-valuenow")) > 18, null, { timeout: 4000 });
  const desktopPath = path.join(artifacts, "effects_lab_desktop.png");
  await page.screenshot({ path: desktopPath, fullPage: true });

  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("smoke ok", mode, phonePath, desktopPath);
  await browser.close();
  server.close();
} catch (err) {
  console.error("CONSOLE", errors);
  await browser.close();
  server.close();
  throw err;
}
