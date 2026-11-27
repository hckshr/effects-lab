// Inline src into index.html and worker.js.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const rd = (file) => fs.readFileSync(path.join(root, "src", file), "utf8");

function toClassic(src) {
  return src
    .replace(/^\s*export\s+\{[^}]*\}\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+(?:default\s+)?/gm, "");
}

const nameMatch = rd("config.js").match(/name:\s*"([^"]+)"/);
if (!nameMatch) {
  console.error("APP_CONFIG.name is missing from src/config.js");
  process.exit(1);
}
const appName = nameMatch[1];

const js = ["config.js", "dsp.js", "reverb-core.js", "envelope-core.js", "engine.js", "ui.js"]
  .map(rd)
  .join("\n;\n")
  .replace(/<\/script/gi, "<\\/script");

const worklet = ["reverb-core.js", "envelope-core.js", "worklet-processors.js"]
  .map((file) => toClassic(rd(file)))
  .join("\n;\n");

const hash = crypto.createHash("sha1").update(worklet).digest("hex").slice(0, 10);
const workletUrl = "/worklet.js?v=" + hash;

let html = rd("index.template.html");
html = html.replaceAll("/*APP_NAME*/", () => appName);
html = html.replace("/*CSS*/", () => rd("style.css"));
html = html.replace("/*WORKLET_URL*/", () => workletUrl);
html = html.replace("/*JS*/", () => js);
fs.writeFileSync(path.join(root, "index.html"), html);

const worker = `const WORKLET = ${JSON.stringify(worklet)};
const HTML = ${JSON.stringify(html)};
const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "microphone=(self)",
};

async function handle(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  if (path === "/favicon.ico") return new Response(null, { status: 204 });
  if (path === "/worklet.js") {
    return new Response(request.method === "HEAD" ? null : WORKLET, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=31536000, immutable",
        ...SECURITY,
      },
    });
  }
  if (path !== "/" && path !== "/index.html") {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(request.method === "HEAD" ? null : HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=120",
      ...SECURITY,
    },
  });
}

export default {
  async fetch(request) {
    try {
      return await handle(request);
    } catch (error) {
      console.error(JSON.stringify({
        event: "worker_error",
        message: error && error.message ? error.message : "unknown",
      }));
      return new Response("Internal error", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
  },
};
`;

fs.writeFileSync(path.join(root, "worker.js"), worker);

const pagePath = path.join(root, ".check-page.mjs");
const workletPath = path.join(root, ".check-worklet.js");
fs.writeFileSync(pagePath, "const WORKLET_URL = " + JSON.stringify(workletUrl) + ";\n" + js);
fs.writeFileSync(workletPath, worklet);
const pageCheck = spawnSync(process.execPath, ["--check", pagePath], { encoding: "utf8" });
const workletCheck = spawnSync(process.execPath, ["--check", workletPath], { encoding: "utf8" });
fs.rmSync(pagePath, { force: true });
fs.rmSync(workletPath, { force: true });
if (pageCheck.status !== 0) {
  console.error(pageCheck.stderr || pageCheck.stdout);
  process.exit(pageCheck.status || 1);
}
if (workletCheck.status !== 0) {
  console.error(workletCheck.stderr || workletCheck.stdout);
  process.exit(workletCheck.status || 1);
}

console.log("built", appName, html.length, "bytes html,", worklet.length, "bytes worklet");
