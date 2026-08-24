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
  expect(() => parseAnalyticsEvent({ name: "heatmap" })).toThrow(/未知事件/);
  expect(() => parseAnalyticsEvent({ name: "scroll", depth: 33 })).toThrow(/depth/);
  expect(parseAnalyticsEvent({ name: "scroll", depth: 50 }).depth).toBe(50);
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

test("跨源、坏 JSON 和过大载荷 fail closed", async () => {
  const cross = await onRequestPost({
    request: requestFrom("https://evil.example", { name: "page_view" }),
    env: {},
  });
  expect(cross.status).toBe(403);

  const bad = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", "{"),
    env: {},
  });
  expect(bad.status).toBe(400);

  const huge = await onRequestPost({
    request: requestFrom("https://blog.silencestar.com", { name: "page_view", title: "x".repeat(5000) }),
    env: {},
  });
  expect(huge.status).toBe(413);
});
