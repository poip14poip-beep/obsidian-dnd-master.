import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const STATIC_ROOT = "https://raw.githubusercontent.com/poip14poip-beep/obsidian-dnd-master./static-site";
const APP_SEGMENT = "/obsidian-app";
const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", wasm: "application/wasm", txt: "text/plain; charset=utf-8",
};
const COMMON = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function resolvePath(pathname: string): string | null {
  const marker = pathname.indexOf(APP_SEGMENT);
  if (marker < 0) return null;
  let suffix: string;
  try { suffix = decodeURIComponent(pathname.slice(marker + APP_SEGMENT.length) || "/"); }
  catch { return null; }
  if (suffix.includes("\\") || suffix.split("/").includes("..")) return null;
  return suffix.replace(/^\/+/, "") || "index.html";
}

function contentType(path: string): string {
  if (path === "index.html" || path === "404.html") return "text/html; charset=utf-8";
  const leaf = path.split("/").pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  return MIME[dot >= 0 ? leaf.slice(dot + 1).toLowerCase() : ""] ?? "application/octet-stream";
}

async function serveAsset(path: string): Promise<Response> {
  const upstream = await fetch(`${STATIC_ROOT}/${path}`, {
    headers: { "User-Agent": "Obsidian-Static-Host/1.3" },
  });
  if (!upstream.ok) return upstream;
  const type = contentType(path);
  const body = type.startsWith("text/html")
    ? new Blob([await upstream.text()], { type })
    : new Blob([await upstream.arrayBuffer()], { type });
  const headers = new Headers(COMMON);
  headers.set("Content-Type", type);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", path === "index.html" || path === "404.html"
    ? "no-store, no-cache, must-revalidate" : "public, max-age=3600");
  headers.set("X-Obsidian-Static-Host", "v5");
  return new Response(body, { status: 200, headers });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: COMMON });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { ...COMMON, "Allow": "GET, HEAD, OPTIONS" } });
  }
  const path = resolvePath(new URL(request.url).pathname);
  if (path === null) return new Response("Not found", { status: 404, headers: COMMON });
  try {
    let response = await serveAsset(path);
    if (!response.ok && !path.includes(".")) response = await serveAsset("index.html");
    if (!response.ok) return new Response("Static asset not found", { status: 404, headers: { ...COMMON, "Cache-Control": "no-store" } });
    if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
    return response;
  } catch (error) {
    console.error("obsidian-app static host failed", error);
    return new Response("Static app temporarily unavailable", { status: 502, headers: { ...COMMON, "Cache-Control": "no-store" } });
  }
});
