import { expect, test } from "bun:test";
import { onRequest } from "../functions/posts/how-posts-work.js";

test("已删除的示例文章返回 410 且不缓存", async () => {
  const response = onRequest();
  const body = await response.text();

  expect(response.status).toBe(410);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(body).toContain("<h1>内容已删除</h1>");
  expect(body).toContain('<meta name="robots" content="noindex">');
});
