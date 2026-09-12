import { expect, test } from "bun:test";
import { onRequestPost, parseAnalyticsEvent } from "../functions/api/event.js";

function requestFrom(origin, body, extraHeaders = {}) {
  return new Request("https://blog.silencestar.com/api/event", {
    method: "POST",
    headers: {
      Origin: origin,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("只接受允许的事件名和 scroll 深度", () => {
  expect(parseAnalyticsEvent({ name: "page_view", path: "/" }).name).toBe("page_view");
  expect(() => parseAnalyticsEvent({ name: "heatmap", path: "/" })).toThrow(/未知事件/);
  expect(() => parseAnalyticsEvent({ name: "scroll", path: "/", depth: 33 })).toThrow(/depth/);
  expect(parseAnalyticsEvent({ name: "scroll", path: "/", depth: 50 }).depth).toBe(50);
});

test("path 与 slug 必须符合站点形状", () => {
  expect(parseAnalyticsEvent({ name: "page_view", path: "/posts/foo/", slug: "foo" }).slug).toBe("foo");
  expect(() => parseAnalyticsEvent({ name: "page_view", path: "../etc/passwd" })).toThrow(/path/);
  expect(() => parseAnalyticsEvent({ name: "page_view", path: "https://evil.example/" })).toThrow(/path/);
  expect(() => parseAnalyticsEvent({ name: "page_view", path: "/OK/" })).toThrow(/path/);
  expect(() => parseAnalyticsEvent({ name: "page_view", path: "/", slug: "Bad Slug" })).toThrow(/slug/);
  expect(() => parseAnalyticsEvent({ name: "page_view", path: "/" })).not.toThrow();
});

test("同源 POST 返回 204，并把事件写入 Analytics Engine", async () => {
  const writes = [];
  const response = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", {
      name: "search",
      path: "/search/",
      query: "Bun",
      result_count: 2,
    }),
    env: {
      ANALYTICS: {
        writeDataPoint(point) {
          writes.push(point);
        },
      },
    },
  });

  expect(response.status).toBe(204);
  expect(writes).toHaveLength(1);
  expect(writes[0].blobs[0]).toBe("search");
  expect(writes[0].blobs[4]).toBe("Bun");
  expect(writes[0].doubles[0]).toBe(2);
});

test("伪造同源 Origin 的非浏览器请求仍通过同源检查（不是鉴权）", async () => {
  // curl -H 'Origin: https://blog.silencestar.com' still satisfies isSameOrigin.
  // Document expected behaviour: Origin/Referer are spoofable; rely on CF rate
  // limiting / WAF outside this function (not assertable in bun test).
  const response = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", {
      name: "page_view",
      path: "/",
    }),
    env: {},
  });
  expect(response.status).toBe(204);
});

test("非法 path/slug 返回 400", async () => {
  const badPath = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", {
      name: "page_view",
      path: "/posts/<script>/",
    }),
    env: {},
  });
  expect(badPath.status).toBe(400);

  const badSlug = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", {
      name: "related_click",
      path: "/posts/foo/",
      slug: "../../x",
    }),
    env: {},
  });
  expect(badSlug.status).toBe(400);
});

test("跨源、坏 JSON 和过大载荷 fail closed", async () => {
  const cross = await onRequestPost({
    request: requestFrom("https://evil.example", { name: "page_view", path: "/" }),
    env: {},
  });
  expect(cross.status).toBe(403);

  const bad = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", "{"),
    env: {},
  });
  expect(bad.status).toBe(400);

  const huge = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", { name: "page_view", path: "/", title: "x".repeat(5000) }),
    env: {},
  });
  expect(huge.status).toBe(413);
});
