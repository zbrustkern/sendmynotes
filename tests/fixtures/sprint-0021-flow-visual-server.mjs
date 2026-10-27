import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = await fs.mkdtemp(path.join(os.tmpdir(), "smn-sprint0021-visual-"));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sprint 0021 flow visual fixture</title><link rel="stylesheet" href="/styles.css"><style>
:root{--font-hw-adam:'HandwryttenAdam';--font-hw-charity:'HandwryttenCharity';--font-hw-chase:'HandwryttenChase';--font-hw-david:'HandwryttenDavid';--font-hw-kate:'HandwryttenKate';--font-hw-will:'HandwryttenWill'}*{box-sizing:border-box}body{margin:0;background:#f3f3ef;color:#252b28;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.fixture{min-height:100vh}.controls{max-width:900px;margin:0 auto;padding:18px 20px 10px}.controls h1{font:26px/1.2 Georgia,serif;margin:0 0 6px}.controls p{margin:6px 0;color:#647067}.control-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:11px 0}.control-row button,.control-row select{min-height:40px;border:1px solid #cbd3cb;border-radius:9px;background:#fff;padding:7px 11px;color:#26382e}.control-row button[aria-pressed=true]{background:#e5f1e9;border-color:#247451;color:#164833}.control-row label{display:inline-flex;align-items:center;gap:7px;min-height:38px}.control-row input{accent-color:#08765b}.preview{width:min(100% - 32px,600px);margin:24px auto;padding:20px;background:#fff;border:1px solid #d9ddd8;border-radius:16px;box-shadow:0 10px 30px #273a2410}.fixture-large .preview section[aria-label="Recipient address"]>div{font-size:54px!important}.fixture-large .preview section[aria-label="Sender address"]{font-size:40px!important}@media(max-width:390px){.controls{padding:14px 12px 6px}.controls h1{font-size:22px}.preview{width:calc(100% - 20px);margin-top:14px;padding:11px}.control-row{gap:6px}.control-row button{padding:6px 8px}}
</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;

await fs.writeFile(path.join(output, "index.html"), html);
await build({
  absWorkingDir: root,
  entryPoints: ["tests/fixtures/sprint-0021-flow-visual-entry.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(output, "bundle.js"),
  jsx: "automatic",
  plugins: [{
    name: "next-client-component-fixture-shims",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^next\/(?:link|image)$/ }, (args) => ({ path: args.path, namespace: "fixture-next" }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "fixture-next" }, (args) => ({
        contents: args.path === "next/link"
          ? `const React = require("react"); module.exports = function FixtureLink({ href, children, ...props }) { return React.createElement("a", { ...props, href }, children); };`
          : `const React = require("react"); module.exports = function FixtureImage({ src, alt, ...props }) { return React.createElement("img", { ...props, src, alt }); };`,
        loader: "js",
        resolveDir: root,
      }));
    },
  }],
});
execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), [
  "-i", "app/globals.css", "-o", path.join(output, "styles.css"), "--config", "tailwind.config.ts",
], { cwd: root, stdio: "inherit" });

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/bundle.js", ["bundle.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname.startsWith("/images/envelope-preview/")) {
    const fileName = path.basename(pathname);
    if (!["envelope-paper.webp", "postage-domestic.webp"].includes(fileName)) {
      response.writeHead(404).end("Not found"); return;
    }
    try {
      const body = await fs.readFile(path.join(root, "public/images/envelope-preview", fileName));
      response.writeHead(200, { "content-type": "image/webp", "cache-control": "no-store" }).end(body);
    } catch { response.writeHead(404).end("Not found"); }
    return;
  }
  if (pathname.startsWith("/fonts/")) {
    const fileName = path.basename(pathname);
    if (!/^hw(?:Adam|Charity|Chase|David|Kate|Will)\.ttf$/.test(fileName)) {
      response.writeHead(404).end("Not found"); return;
    }
    try {
      const body = await fs.readFile(path.join(root, "public/fonts", fileName));
      response.writeHead(200, { "content-type": "font/ttf", "cache-control": "no-store" }).end(body);
    } catch { response.writeHead(404).end("Not found"); }
    return;
  }
  const asset = staticFiles.get(pathname);
  if (!asset) { response.writeHead(404).end("Fixture blocks this request"); return; }
  const body = await fs.readFile(path.join(output, asset[0]));
  response.writeHead(200, { "content-type": asset[1], "cache-control": "no-store" }).end(body);
});
server.listen(3133, "127.0.0.1", () => console.log("Sprint 0021 flow fixture ready at http://127.0.0.1:3133"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(async () => {
  await fs.rm(output, { recursive: true, force: true });
  process.exit(0);
}));
