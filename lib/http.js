const BODY_LIMIT = 256 * 1024;

function allowedOrigins() {
  return new Set((process.env.FIN_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));
}

export function corsHeaders(request) {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigins();
  const allowOrigin = !origin || origin === 'null'
    ? '*'
    : allowed.has(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-FIN-Client-ID',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
}

export function json(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), ...extraHeaders },
  });
}

export async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > BODY_LIMIT) throw Object.assign(new Error('Request body is too large'), { status: 413 });
  const raw = await request.text();
  if (!raw || raw.length > BODY_LIMIT) throw Object.assign(new Error('Request body is empty or too large'), { status: raw ? 413 : 400 });
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON'), { status: 400 });
  }
}

