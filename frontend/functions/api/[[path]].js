// Cloudflare Pages Function — proxies /api/* to Railway backend
// Set BACKEND_URL secret in Cloudflare Pages → Settings → Environment Variables
// e.g. BACKEND_URL = https://meckgrade-production.up.railway.app

export async function onRequest(context) {
  const { request, env } = context;
  const backendUrl = env.BACKEND_URL || "https://meck-grade-ze0i-production.up.railway.app";

  if (!backendUrl) {
    return new Response(JSON.stringify({ detail: "BACKEND_URL not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const targetUrl = `${backendUrl}${url.pathname}${url.search}`;

  const proxied = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    redirect: "follow",
  });

  try {
    const response = await fetch(proxied);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ detail: "Backend unreachable", error: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
