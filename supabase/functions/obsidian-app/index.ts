import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const STATIC_ROOT =
  "https://raw.githubusercontent.com/poip14poip-beep/obsidian-dnd-master./static-site";
const APP_SEGMENT = "/obsidian-app";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function extensionOf(path: string): string {
  const leaf = path.split("/").pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  return dot >= 0 ? leaf.slice(dot).toLowerCase() : "";
}

function safeStaticPath(pathname: string): string | null {
  const marker = pathname.indexOf(APP_SEGMENT);
  if (marker < 0) return null;
  const suffix = pathname.slice(marker + APP_SEGMENT.length);
  let decoded: string;
  try {
    decoded = decodeURIComponent(suffix || "/");
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.split("/").some((part) => part === "..")) {
    return null;
  }
  const normalized = decoded.replace(/^\/+/, "");
  return normalized || "index.html";
}

function responseHeaders(path: string, upstreamHeaders?: Headers): Headers {
  const headers = new Headers(CORS_HEADERS);
  headers.set("Content-Type", MIME_TYPES[extensionOf(path)] ?? "application/octet-stream");
  headers.set(
    "Cache-Control",
    path === "index.html" || path === "404.html"
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=3600",
  );
  const etag = upstreamHeaders?.get("etag");
  if (etag) headers.set("ETag", etag);
  return headers;
}

async function fetchStatic(path: string): Promise<Response> {
  const upstream = await fetch(`${STATIC_ROOT}/${path}`, {
    headers: { "User-Agent": "Obsidian-Static-Host/1.0" },
  });
  if (!upstream.ok) return upstream;
  return new Response(upstream.body, {
    status: 200,
    headers: responseHeaders(path, upstream.headers),
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...CORS_HEADERS, "Allow": "GET, HEAD, OPTIONS" },
    });
  }

  const url = new URL(request.url);
  const path = safeStaticPath(url.pathname);
  if (path === null) {
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  }

  try {
    let upstream = await fetchStatic(path);
    if (!upstream.ok && !extensionOf(path)) {
      upstream = await fetchStatic("index.html");
    }
    if (!upstream.ok) {
      return new Response("Static asset not found", {
        status: 404,
        headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
      });
    }
    if (request.method === "HEAD") {
      return new Response(null, { status: upstream.status, headers: upstream.headers });
    }
    return upstream;
  } catch (error) {
    console.error("obsidian-app static host failed", error);
    return new Response("Static app temporarily unavailable", {
      status: 502,
      headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
    });
  }
});
