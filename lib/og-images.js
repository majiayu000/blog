import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { primaryTopicForPost } from "./posts.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapSlug(slug, maxLength = 22) {
  const words = slug.toUpperCase().split("-");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export function renderOgSvg({ slug, date, label, siteTitle }) {
  const lines = wrapSlug(slug);
  const titleLines = lines
    .map(
      (line, index) =>
        `<text x="84" y="${286 + index * 82}" class="title">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#ded9cc" stroke-width="1"/>
    </pattern>
    <style>
      .sans { font-family: Arial, Helvetica, sans-serif; }
      .mono { font-family: Menlo, Consolas, monospace; }
      .title { fill: #171611; font-family: Arial, Helvetica, sans-serif; font-size: 68px; font-weight: 800; letter-spacing: -2px; }
    </style>
  </defs>
  <rect width="1200" height="630" fill="#f7f5ee"/>
  <rect x="780" width="420" height="630" fill="url(#grid)" opacity="0.8"/>
  <path d="M850 630L1200 280V630Z" fill="#3657ee" opacity="0.1"/>
  <rect x="0" y="0" width="12" height="630" fill="#3657ee"/>
  <text x="84" y="86" class="sans" fill="#171611" font-size="26" font-weight="700">${escapeXml(siteTitle)}</text>
  <text x="246" y="86" class="mono" fill="#777166" font-size="17">/LOG</text>
  <text x="84" y="168" class="mono" fill="#3657ee" font-size="18" letter-spacing="3">// ${escapeXml(label.toUpperCase())}</text>
  ${titleLines}
  <line x1="84" y1="536" x2="728" y2="536" stroke="#cbc5b8"/>
  <text x="84" y="578" class="mono" fill="#777166" font-size="17">${escapeXml(date.replaceAll("-", "."))}</text>
  <text x="412" y="578" class="mono" fill="#3657ee" font-size="17">READ THE FULL NOTE  →</text>
  <text x="1015" y="548" class="sans" fill="#3657ee" font-size="128" font-weight="800" opacity="0.92">/</text>
  <text x="990" y="582" class="mono" fill="#777166" font-size="14">SILENT·STAR</text>
</svg>`;
}

function renderPng(svg) {
  return new Resvg(svg, {
    background: "#f7f5ee",
    fitTo: { mode: "width", value: 1200 },
  })
    .render()
    .asPng();
}

export function generateOgImages({ posts, outputDir, site }) {
  const ogDir = path.join(outputDir, "og");
  fs.mkdirSync(ogDir, { recursive: true });

  const siteSvg = renderOgSvg({
    slug: "building-ai-agents-in-public",
    date: posts[0]?.date.slice(0, 4) ?? "NOTES",
    label: "Independent notes",
    siteTitle: site.title,
  });
  fs.writeFileSync(path.join(ogDir, "site.png"), renderPng(siteSvg));

  for (const post of posts) {
    const topic = primaryTopicForPost(post);
    const svg = renderOgSvg({
      slug: post.slug,
      date: post.updated || post.date,
      label: topic.english,
      siteTitle: site.title,
    });
    fs.writeFileSync(path.join(ogDir, `${post.slug}.png`), renderPng(svg));
  }
}
