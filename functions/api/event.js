const ALLOWED_EVENTS = new Set([
  "page_view",
  "scroll",
  "search",
  "search_result_click",
  "related_click",
  "journey_click",
  "copy_link",
  "copy_code",
  "outbound_click",
  "comments_view",
]);

const MAX_BODY_BYTES = 4096;
const MAX_STRING = 256;
/** Site pathname shape only — not an allowlist of published URLs. */
const PATH_RE = /^\/[a-z0-9/_-]*$/;
/** Optional post slug; empty string means unset. */
const SLUG_RE = /^[a-z0-9_-]*$/;

function jsonResponse(status, message) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Same-origin Origin/Referer check. This only reduces naive browser CSRF;
 * it is not authentication — any client can forge those headers.
 */
function isSameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) return origin === url.origin;
  const referer = request.headers.get("Referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === url.origin;
  } catch {
    return false;
  }
}

function clip(value, max = MAX_STRING) {
  if (value == null) return "";
  return String(value).slice(0, max);
}

function assertPathAndSlug(path, slug) {
  if (!PATH_RE.test(path)) {
    throw new Error("path 不合法");
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error("slug 不合法");
  }
}

export function parseAnalyticsEvent(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("事件必须是 JSON 对象");
  }
  if (!ALLOWED_EVENTS.has(raw.name)) {
    throw new Error("未知事件");
  }

  const depth = Number(raw.depth) || 0;
  if (raw.name === "scroll" && depth !== 50 && depth !== 100) {
    throw new Error("scroll 只接受 depth=50 或 100");
  }

  const resultCount = Number(raw.result_count);
  if (raw.result_count != null && (!Number.isFinite(resultCount) || resultCount < 0 || resultCount > 10000)) {
    throw new Error("result_count 不合法");
  }

  const path = clip(raw.path, 128);
  const slug = clip(raw.slug, 128);
  assertPathAndSlug(path, slug);

  return {
    name: raw.name,
    path,
    title: clip(raw.title),
    pageType: clip(raw.pageType, 32),
    query: clip(raw.query, 200),
    slug,
    direction: clip(raw.direction, 16),
    href: clip(raw.href),
    depth,
    result_count: Number.isFinite(resultCount) && resultCount > 0 ? resultCount : 0,
  };
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) {
    return jsonResponse(403, "Forbidden");
  }

  const rawText = await request.text();
  if (rawText.length > MAX_BODY_BYTES) {
    return jsonResponse(413, "Payload too large");
  }

  let parsed;
  try {
    parsed = parseAnalyticsEvent(JSON.parse(rawText));
  } catch {
    return jsonResponse(400, "Bad Request");
  }

  console.log(
    JSON.stringify({
      type: "blog_event",
      name: parsed.name,
      path: parsed.path,
      pageType: parsed.pageType,
      query: parsed.query,
      slug: parsed.slug,
      direction: parsed.direction,
      href: parsed.href,
      depth: parsed.depth,
      result_count: parsed.result_count,
    }),
  );

  if (env?.ANALYTICS?.writeDataPoint) {
    env.ANALYTICS.writeDataPoint({
      indexes: [parsed.path],
      blobs: [
        parsed.name,
        parsed.path,
        parsed.pageType,
        parsed.title,
        parsed.query,
        parsed.slug,
        parsed.direction,
        parsed.href,
      ],
      doubles: [parsed.result_count, parsed.depth],
    });
  }

  return new Response(null, { status: 204 });
}
