import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("worker, page, and readme share the Effects Lab identity", () => {
  const config = fs.readFileSync("src/config.js", "utf8");
  const names = [...config.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["Effects Lab"]);

  const toml = fs.readFileSync("wrangler.toml", "utf8");
  assert.match(toml, /^name = "effects-lab"$/m);
  assert.match(toml, /compatibility_date = "2026-11-27"/);
  assert.match(toml, /\[observability\]/);
  assert.match(toml, /\[observability\.traces\]/);

  const readme = fs.readFileSync("README.md", "utf8");
  assert.match(readme, /https:\/\/effects-lab\.hckshr\.workers\.dev/);
  assert.match(readme, /Effects Lab/);

  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /<title>Effects Lab<\/title>/);
  assert.match(html, /id="appTitle">Effects Lab</);
  assert.match(html, /worklet\.js\?v=/);
  assert.match(html, /echoCancellation/);
  assert.doesNotMatch(html, /Reverb Lab/);

  const worker = fs.readFileSync("worker.js", "utf8");
  assert.match(worker, /reverb-fdn/);
  assert.match(worker, /envelope-follow/);
  assert.match(worker, /Effects Lab/);
  assert.match(worker, /permissions-policy/);
});
