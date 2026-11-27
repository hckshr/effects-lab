// Phone and desktop checks for the − / + / = controls.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
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
const artifacts = "/opt/cursor/artifacts";
fs.mkdirSync(artifacts, { recursive: true });

const browser = await chromium.launch({
  executablePath: chrome,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function checkControls(page, label) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#inputSlot [data-step='1']");
  const buttons = page.locator(".knob-steps button");
  const count = await buttons.count();
  assert.ok(count >= 12, label + " has " + count + " step buttons");
  for (let i = 0; i < Math.min(count, 6); i++) {
    const box = await buttons.nth(i).boundingBox();
    assert.ok(box.height >= 44, label + " button " + i + " is " + box.height + "px");
    assert.ok(box.width >= 44, label + " button " + i + " is " + box.width + "px wide");
    const touch = await buttons.nth(i).evaluate((el) => getComputedStyle(el).touchAction);
    assert.equal(touch, "manipulation");
  }
  const ring = page.locator("#inputSlot .knob-ring");
  assert.equal(await ring.evaluate((el) => getComputedStyle(el).pointerEvents), "none");
}

try {
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const phoneErrors = [];
  phone.on("pageerror", (err) => phoneErrors.push(err.message));
  await checkControls(phone, "phone");

  const input = phone.locator("#inputSlot .knob");
  await input.scrollIntoViewIfNeeded();
  const before = await phone.evaluate(() => window.__lab.state.inputGain);
  const ring = await input.locator(".knob-ring").boundingBox();
  await phone.mouse.move(ring.x + ring.width / 2, ring.y + 8);
  await phone.mouse.down();
  await phone.mouse.move(ring.x + ring.width / 2, ring.y - 120, { steps: 8 });
  await phone.mouse.up();
  assert.equal(await phone.evaluate(() => window.__lab.state.inputGain), before);

  const plus = input.locator('[data-step="1"]');
  const box = await plus.boundingBox();
  await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await phone.mouse.down();
  await phone.waitForTimeout(900);
  await phone.mouse.up();
  const held = await phone.evaluate(() => window.__lab.state.inputGain);
  assert.ok(held > before + 0.2, "hold did not accelerate (" + held + ")");
  await input.locator('[data-step="0"]').click();
  await phone.waitForFunction(() => Math.abs(window.__lab.state.inputGain - 1) < 0.001);
  assert.match(await input.locator(".knob-value").innerText(), /0\.0 dB/);

  await phone.locator("#inputSlot").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await phone.screenshot({ path: path.join(artifacts, "effects_lab_controls_phone.png") });

  const reverb = phone.locator('.pedal[data-id="reverb"]');
  await reverb.locator(".more-btn").click();
  await reverb.locator('[data-param="width"] [data-step="1"]').waitFor();
  assert.equal(await reverb.locator(".knob-steps button").count(), 21);
  await reverb.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await phone.screenshot({ path: path.join(artifacts, "effects_lab_controls_pedal_phone.png") });
  assert.equal(phoneErrors.length, 0, phoneErrors.join("\n"));

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const deskErrors = [];
  desktop.on("pageerror", (err) => deskErrors.push(err.message));
  await checkControls(desktop, "desktop");
  const pedal = desktop.locator('.pedal[data-id="reverb"]');
  await pedal.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await desktop.screenshot({ path: path.join(artifacts, "effects_lab_controls_desktop.png") });
  const deskPlus = await pedal.locator('[data-param="mix"] [data-step="1"]').boundingBox();
  assert.ok(deskPlus.height >= 44 && deskPlus.width >= 44);
  assert.equal(deskErrors.length, 0, deskErrors.join("\n"));

  console.log("controls ok");
  await browser.close();
  server.close();
} catch (err) {
  await browser.close();
  server.close();
  throw err;
}
