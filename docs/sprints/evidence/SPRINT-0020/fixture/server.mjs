import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixtureDir, "../../../../..");
const distDir = path.join(fixtureDir, "dist");
const failureMode = (url) => new URL(url, "http://127.0.0.1").searchParams.get("fail") || "";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp", ".ttf": "font/ttf" };

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname;
  const mode = requestUrl.searchParams.get("fixtureMode") || failureMode(request.url || "/");
  const resourceFailure = requestUrl.searchParams.get("fixtureFail");
  let file;
  if (pathname === "/" || pathname === "/index.html") {
    const html = await readFile(path.join(distDir, "index.html"), "utf8");
    const version = mode ? `?fixtureMode=${encodeURIComponent(mode)}` : "";
    return send(response, html.replaceAll("/fixture.js", `/fixture.js${version}`).replaceAll("/fixture.css", `/fixture.css${version}`), ".html");
  } else if (pathname === "/fixture.js" || pathname === "/fixture.css") {
    const outputPath = path.join(distDir, pathname.slice(1));
    const content = await readFile(outputPath, "utf8");
    if (pathname === "/fixture.js") {
      const paper = mode === "paper" || mode === "all" ? "?fixtureFail=paper" : "";
      const stamp = mode === "stamp" || mode === "all" ? "?fixtureFail=stamp" : "";
      return send(response, content
        .replaceAll("/images/envelope-preview/envelope-paper.webp", `/images/envelope-preview/envelope-paper.webp${paper}`)
        .replaceAll("/images/envelope-preview/postage-domestic.webp", `/images/envelope-preview/postage-domestic.webp${stamp}`), ".js");
    }
    const fonts = mode === "fonts" || mode === "all" ? "?fixtureFail=fonts" : "";
    return send(response, content.replace(/(\/fonts\/hw(?:Adam|Chase|David|Kate|Will)\.ttf)/g, `$1${fonts}`), ".css");
  }
  else if (pathname === "/images/envelope-preview/envelope-paper.webp") {
    if (resourceFailure === "paper") return notFound(response);
    file = path.join(repoRoot, "public", pathname);
  } else if (pathname === "/images/envelope-preview/postage-domestic.webp") {
    if (resourceFailure === "stamp") return notFound(response);
    file = path.join(repoRoot, "public", pathname);
  } else if (pathname.startsWith("/fonts/") && /^\/fonts\/hw(?:Adam|Chase|David|Kate|Will)\.ttf$/.test(pathname)) {
    if (resourceFailure === "fonts") return notFound(response);
    file = path.join(repoRoot, "public", pathname);
  } else return notFound(response);

  try {
    const data = await readFile(file);
    response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store, max-age=0", "pragma": "no-cache", "expires": "0", "x-content-type-options": "nosniff" });
    response.end(data);
  } catch {
    notFound(response);
  }
}).listen(3131, "127.0.0.1", () => console.log("SPRINT-0020 fixture: http://127.0.0.1:3131/"));

function notFound(response) {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store, max-age=0", "pragma": "no-cache", "expires": "0" });
  response.end("Not found");
}

function send(response, content, extension) {
  response.writeHead(200, { "content-type": types[extension] || "application/octet-stream", "cache-control": "no-store, max-age=0", "pragma": "no-cache", "expires": "0", "x-content-type-options": "nosniff" });
  response.end(content);
}
