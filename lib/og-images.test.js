import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateOgImages, renderOgSvg } from "./og-images.js";

test("分享图 SVG 转义站点文本并保持固定画布", () => {
  const svg = renderOgSvg({
    slug: "agent-xray",
    date: "2026-08-24",
    label: "Product & X-Ray",
    siteTitle: "Silent <Star>",
  });
  expect(svg).toContain('width="1200" height="630"');
  expect(svg).toContain("Silent &lt;Star&gt;");
  expect(svg).not.toContain("Silent <Star>");
});

test("为站点和每篇文章生成有效 PNG", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-og-"));
  generateOgImages({
    posts: [
      {
        slug: "agent-xray",
        date: "2026-08-24",
        updated: "",
        tags: ["Grok Bot"],
      },
    ],
    outputDir,
    site: { title: "Silent Star" },
  });
  for (const name of ["site.png", "agent-xray.png"]) {
    const image = fs.readFileSync(path.join(outputDir, "og", name));
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }
});
