import fs from "node:fs";
import path from "node:path";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Tags that load or rewrite document resources; never allow remote targets. */
const REMOTE_RESOURCE_TAGS = new Set([
  "link",
  "script",
  "img",
  "image",
  "video",
  "audio",
  "source",
  "iframe",
  "embed",
  "object",
  "base",
]);

/**
 * SVG-namespace-only resource tags. In the HTML namespace these names create
 * unknown elements that do not fetch; only check them inside an open <svg>
 * outside an HTML integration point (foreignObject).
 */
const SVG_ONLY_RESOURCE_TAGS = new Set(["feimage", "use"]);

/** Attrs that can point at a network resource on the tags above. */
const REMOTE_RESOURCE_ATTRS = new Set([
  "href",
  "src",
  "data",
  "poster",
  "srcset",
  "imagesrcset",
  "xlink:href",
]);

/** Attrs whose value is a comma-separated candidate list (URL [descriptor], ...). */
const SRCSET_ATTRS = new Set(["srcset", "imagesrcset"]);

/**
 * Tags that exist to embed foreign documents or rewrite URL resolution.
 * Ban them outright — self-contained posts use local img/video/audio/source.
 */
const FORBIDDEN_EMBED_TAGS = new Set(["iframe", "embed", "object", "base"]);

/** CSS @import / url(...) with absolute http(s) or protocol-relative targets. */
const REMOTE_CSS_RESOURCE_RE =
  /(?:@import\s+(?:url\(\s*)?|url\(\s*)["']?(?:https?:)?\/\//i;

// Unquoted values keep `=` / quotes / `<` / `` ` `` as ordinary characters
// (HTML attribute-value unquoted state) so `alt=x=src=local` is one value.
// Separators are HTML ASCII whitespace only — `\s` would treat NBSP as a
// break and invent attributes the browser does not see.
//
// Attribute *names* follow the HTML attribute-name state: `"`, `'`, `<`, and
// `` ` `` are parse errors but still belong to the name. Excluding them would
// restart tokenization at `src` inside `foo"src=local` and, with first-wins
// duplicates, discard a later real remote `src`.
//
// A leading `=` in the before-attribute-name state starts a parse-error
// attribute whose name includes that `=` (`=src=local` → name `=src`). An
// unanchored name class that excludes `=` would invent `src=local` instead and
// first-wins would drop a later real remote `src`.
const ATTR_TOKEN_RE =
  /((?:=)?[^\t\n\f\r =\/>]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r >]*)(?=[\t\n\f\r >]|$)))?/g;

/**
 * RAWTEXT / RCDATA bodies: browsers do not parse nested tags inside these.
 * `noscript` is intentionally omitted — with scripting disabled, body-level
 * noscript contents are parsed as HTML, so remote resources inside must still
 * fail the self-containment gate.
 */
const RAW_TEXT_TAGS = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
]);

/** Case-insensitive ASCII search from `from` without copying/lowercasing the haystack. */
function indexOfAsciiIgnoreCase(haystack, needleLower, from = 0) {
  const n = needleLower.length;
  if (n === 0) return from <= haystack.length ? from : -1;
  outer: for (let i = from; i <= haystack.length - n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let a = haystack.charCodeAt(i + j);
      const b = needleLower.charCodeAt(j);
      if (a >= 65 && a <= 90) a += 32; // A-Z → a-z
      if (a !== b) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * End of an HTML comment starting at `<!--` (`start` points at `<`).
 * Supports normal `-->` and the HTML end-bang form `--!>`.
 * Returns the index just past the closer, or `text.length` if unclosed.
 */
function commentEndIndex(text, start) {
  if (text.startsWith("<!-->", start)) return start + 5;
  if (text.startsWith("<!--->", start)) return start + 6;
  let i = start + 4;
  while (i < text.length - 2) {
    if (text[i] === "-" && text[i + 1] === "-") {
      if (text[i + 2] === ">") return i + 3;
      if (text[i + 2] === "!" && i + 3 < text.length && text[i + 3] === ">") {
        return i + 4;
      }
    }
    i += 1;
  }
  return text.length;
}

/**
 * Advance from inside a tag (after the name) to just past its closing `>`,
 * respecting quoted attribute values so a `>` inside quotes is not the end.
 */
function skipTagRemainder(text, from) {
  let k = from;
  let quote = null;
  let afterEquals = false;
  while (k < text.length) {
    const ch = text[k];
    if (quote) {
      if (ch === quote) {
        quote = null;
        afterEquals = false;
      }
      k += 1;
      continue;
    }
    if (afterEquals) {
      if (isAsciiWhitespace(ch)) {
        k += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        k += 1;
        continue;
      }
      while (k < text.length && !isAsciiWhitespace(text[k]) && text[k] !== ">") k += 1;
      afterEquals = false;
      continue;
    }
    if (ch === "=") {
      afterEquals = true;
      k += 1;
      continue;
    }
    if (ch === ">") return k + 1;
    k += 1;
  }
  return text.length;
}

/**
 * Skip an HTML bogus comment / markup declaration / PI starting at `<` where
 * the next char is `!` (not `<!--`) or `?`. These tokens end at the first `>`.
 */
function skipBogusCommentOrDeclaration(text, start) {
  const gt = text.indexOf(">", start + 2);
  return gt === -1 ? text.length : gt + 1;
}

/**
 * Advance past a RAWTEXT/RCDATA element body. The matched end-tag name must be
 * followed by HTML whitespace, `/`, or `>` — a longer prefix like `</scriptx>`
 * must not close `<script>`. End-tag scanning is quote-aware so a `>` inside a
 * quoted attribute does not terminate the end tag early.
 */
function skipRawTextBody(text, from, tag) {
  const close = `</${tag}`;
  let pos = from;
  while (pos < text.length) {
    const closeAt = indexOfAsciiIgnoreCase(text, close, pos);
    if (closeAt === -1) return text.length;
    let k = closeAt + close.length;
    if (k >= text.length) return text.length;
    const ch = text[k];
    if (ch === ">" || ch === "/" || isAsciiWhitespace(ch)) {
      return skipTagRemainder(text, k);
    }
    pos = closeAt + 1;
  }
  return text.length;
}
/**
 * Decode HTML character references in attribute values before URL checks.
 * Browsers decode &colon; / &#x3a; / &#58; (semicolon optional for numeric
 * refs) prior to fetching; raw-text checks would otherwise miss remotes.
 *
 * Named refs cover URL-significant characters. Unknown named refs are left
 * intact and later fail-closed in resource URL checks.
 */
const HTML_NAMED_REFS = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", "\u00a0"],
  ["colon", ":"],
  // HTML named character references for `/` and `\`.
  ["sol", "/"],
  ["solidus", "/"],
  ["bsol", "\\"],
  ["tab", "\t"],
  ["newline", "\n"],
  ["excl", "!"],
]);

/**
 * HTML numeric character references: NULL and surrogate / out-of-range code
 * points become U+FFFD (not a literal NUL that later edge-trimming would drop).
 */
function decodeNumericCharacterReference(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "\uFFFD";
  if (code === 0 || (code >= 0xd800 && code <= 0xdfff)) return "\uFFFD";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "\uFFFD";
  }
}

function decodeHtmlCharacterReferences(value) {
  return String(value).replace(
    /&(?:#x([0-9a-f]+)(?:;|(?![0-9a-f]))|#([0-9]+)(?:;|(?![0-9]))|([a-z][a-z0-9]*);)/gi,
    (entity, hex, dec, named) => {
      if (hex !== undefined || dec !== undefined) {
        const code =
          hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
        return decodeNumericCharacterReference(code);
      }
      return HTML_NAMED_REFS.get(named.toLowerCase()) ?? entity;
    },
  );
}

/**
 * Scan open tags with quote-aware attribute regions so a quoted `>` cannot
 * truncate the tag before resource attributes (`alt=">" srcset="https://…"`).
 * HTML allows `/` between the tag name and attributes (`<img/src=…>`); only
 * `/>` is self-closing.
 *
 * Also tracks SVG vs HTML namespace depth so SVG-only resource tags (`use`,
 * `feimage`) are inspected only in SVG context outside `foreignObject`.
 */
function* iterateOpenTags(html) {
  const text = String(html);
  let i = 0;
  let svgDepth = 0;
  let foreignObjectDepth = 0;
  while (i < text.length) {
    const start = text.indexOf("<", i);
    if (start === -1) break;
    const next = text[start + 1];
    // Skip HTML comments, including abrupt closes and end-bang `--!>`.
    if (text.startsWith("<!--", start)) {
      i = commentEndIndex(text, start);
      continue;
    }
    // Bogus comments / declarations / PIs end at the first `>`.
    // `%` is not a bogus-comment opener in HTML — `<% …>` leaves following
    // markup (e.g. `<img>`) as normal tokens the browser will parse.
    if (next === "!" || next === "?") {
      i = skipBogusCommentOrDeclaration(text, start);
      continue;
    }
    // End tags: track SVG / foreignObject namespace exits, then skip the tag.
    // A non-letter after `</` is an HTML bogus comment ending at the first `>`
    // (not a quote-aware end tag).
    if (next === "/") {
      const afterSlash = text[start + 2];
      if (!afterSlash || !/[a-zA-Z]/.test(afterSlash)) {
        i = skipBogusCommentOrDeclaration(text, start);
        continue;
      }
      let j = start + 2;
      while (
        j < text.length &&
        !isAsciiWhitespace(text[j]) &&
        text[j] !== "/" &&
        text[j] !== ">"
      ) {
        j += 1;
      }
      const endTag = text.slice(start + 2, j).toLowerCase();
      i = skipTagRemainder(text, j);
      if (endTag === "foreignobject" && foreignObjectDepth > 0) {
        foreignObjectDepth -= 1;
      } else if (endTag === "svg" && svgDepth > 0) {
        svgDepth -= 1;
        if (svgDepth === 0) foreignObjectDepth = 0;
      }
      continue;
    }
    if (!next || !/[a-zA-Z]/.test(next)) {
      i = start + 1;
      continue;
    }

    // HTML tag-name state: consume until whitespace, `/`, or `>` — including
    // non-ASCII letters so `<imgé …>` is the unknown element `imgé`, not `img`.
    let j = start + 1;
    while (
      j < text.length &&
      !isAsciiWhitespace(text[j]) &&
      text[j] !== "/" &&
      text[j] !== ">"
    ) {
      j += 1;
    }
    const tag = text.slice(start + 1, j).toLowerCase();

    // Optional slash transition between tag name and attributes.
    while (j < text.length && (text[j] === "/" || isAsciiWhitespace(text[j]))) {
      if (text[j] === "/" && text[j + 1] === ">") break;
      j += 1;
    }

    const attrStart = j;
    let quote = null;
    // Only enter quoted mode after `=` (HTML attribute-value start). Quotes
    // inside unquoted values (e.g. alt=x' src="…") are ordinary characters.
    let afterEquals = false;
    while (j < text.length) {
      const ch = text[j];
      if (quote) {
        if (ch === quote) {
          quote = null;
          afterEquals = false;
        }
        j += 1;
        continue;
      }
      if (afterEquals) {
        if (isAsciiWhitespace(ch)) {
          j += 1;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          j += 1;
          continue;
        }
        // Unquoted attribute value — consume until whitespace or `>`.
        while (j < text.length && !isAsciiWhitespace(text[j]) && text[j] !== ">") j += 1;
        afterEquals = false;
        continue;
      }
      if (ch === "=") {
        afterEquals = true;
        j += 1;
        continue;
      }
      if (ch === ">") break;
      j += 1;
    }
    if (j >= text.length) break;

    const attrRegion = text.slice(attrStart, j);
    // `/>` (optional whitespace before `>`) is self-closing — browsers pop the
    // element immediately, so namespace depth must not stay elevated.
    const selfClosing = /\/[\t\n\f\r ]*$/.test(attrRegion);
    const attrText = attrRegion.replace(/\/[\t\n\f\r ]*$/, "");
    const inSvgContext = svgDepth > 0 && foreignObjectDepth === 0;
    yield { tag, attrText, inSvgContext };

    if (!selfClosing) {
      if (tag === "svg") svgDepth += 1;
      else if (tag === "foreignobject" && svgDepth > 0) foreignObjectDepth += 1;
    }

    i = j + 1;

    // Skip RAWTEXT/RCDATA contents so unmatched quotes inside script/style
    // cannot poison scanning past a real resource tag the browser loads.
    // SVG `<title>` is an HTML integration point (not HTML RCDATA), so nested
    // tags inside it must still be scanned.
    if (RAW_TEXT_TAGS.has(tag) && !(tag === "title" && inSvgContext) && !selfClosing) {
      i = skipRawTextBody(text, i, tag);
    }
  }
}

/** HTML ASCII whitespace: TAB, LF, FF, CR, SPACE (U+0009/A/C/D/20). */
function isAsciiWhitespace(ch) {
  return ch === "\t" || ch === "\n" || ch === "\f" || ch === "\r" || ch === " ";
}

/**
 * URL-ignored ASCII whitespace removed throughout (TAB/LF/FF/CR). Broader
 * C0 + SPACE are trimmed only at the edges — internal SPACE must remain so
 * `"/ /evil.com/a.png"` stays a same-origin path, not `//evil.com/…`.
 */
const URL_IGNORED_WHITESPACE_RE = /[\t\n\f\r]+/g;
const URL_EDGE_C0_OR_SPACE_RE = /^[\u0000-\u0020]+|[\u0000-\u0020]+$/g;

/**
 * Decode entities, apply URL whitespace rules, and normalize `\` → `/` so
 * htt&tab;ps://, leading &#11;, and \\evil.com/… cannot evade.
 */
function normalizeForRemoteUrlCheck(value) {
  return decodeHtmlCharacterReferences(value)
    .replace(URL_IGNORED_WHITESPACE_RE, "")
    .replace(URL_EDGE_C0_OR_SPACE_RE, "")
    .replace(/\\/g, "/");
}

/**
 * Probe base for special-scheme resolution. Off-origin http(s) results are
 * remote; `http:evil.com/x` resolves to `http://evil.com/x` even without `//`.
 * Compare origins — never exempt the probe hostname (e.g. `http:blog.invalid/x`
 * is still an absolute http URL on a real page).
 */
const REMOTE_URL_PROBE_BASE = "https://blog.invalid/posts/probe/";

/** Absolute http(s) or protocol-relative // URL on an already-decoded string. */
function isRemoteResourceUrlDecoded(trimmed) {
  if (!trimmed) return false;
  if (trimmed.startsWith("//")) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (!/^https?:/i.test(trimmed)) return false;
  try {
    const base = new URL(REMOTE_URL_PROBE_BASE);
    const resolved = new URL(trimmed, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return false;
    // Same-origin path-relative forms (https:./local.png) stay local; any
    // origin change (scheme or host) is a network dependency.
    return resolved.origin !== base.origin;
  } catch {
    // Unparseable http(s) candidate — fail closed.
    return true;
  }
}

/** Absolute http(s) or protocol-relative // URL (after entity decode + normalize). */
function isRemoteResourceUrl(value) {
  const decoded = decodeHtmlCharacterReferences(String(value));
  if (isRemoteResourceUrlDecoded(normalizeForRemoteUrlCheck(value))) return true;
  // Fail closed only for named refs that remain unresolved after decoding
  // (e.g. unknown `&foo;`). Decoded `&amp;` must not reject local URLs.
  return /&[a-z][a-z0-9]*;/i.test(decoded);
}

/**
 * HTML srcset density/width/height descriptors. Density uses a valid
 * non-negative floating-point number (including scientific notation like
 * `1e0x`) then `x`. Width/height are non-negative integers then `w` / `h`
 * (`h` is reserved for future compatibility but still delimits candidates).
 */
const SRCSET_DESCRIPTOR_RE =
  /^(?:(?:\d+\.\d+|\d+\.?|\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)x$|^\d+[wh]$/;

/**
 * Yield URL tokens from an already-decoded srcset / imagesrcset value.
 * Per the srcset grammar, a URL token runs until whitespace (commas may be
 * part of the URL). Candidate boundaries are whitespace + optional
 * descriptors, then a comma. data: URLs keep internal commas the same way.
 */
function* srcsetUrlTokens(input) {
  let i = 0;

  const skipWs = () => {
    while (i < input.length && isAsciiWhitespace(input[i])) i += 1;
  };

  /**
   * Advance to the next top-level comma. HTML srcset has a single in-parens
   * flag (not a nesting counter): another `(` inside is ordinary text, and the
   * first `)` leaves the in-parens state.
   */
  const skipToTopLevelComma = () => {
    let inParens = false;
    while (i < input.length) {
      const ch = input[i];
      if (ch === "(") inParens = true;
      else if (ch === ")") inParens = false;
      else if (ch === "," && !inParens) return;
      i += 1;
    }
  };

  const skipDescriptors = () => {
    skipWs();
    while (i < input.length && input[i] !== ",") {
      const start = i;
      let inParens = false;
      // Srcset descriptor tokenizer: whitespace / comma only end a token when
      // not in the parentheses state (boolean, not nested depth).
      while (i < input.length) {
        const ch = input[i];
        if (ch === "(") {
          inParens = true;
          i += 1;
          continue;
        }
        if (ch === ")") {
          inParens = false;
          i += 1;
          continue;
        }
        if (!inParens && (isAsciiWhitespace(ch) || ch === ",")) break;
        i += 1;
      }
      const token = input.slice(start, i);
      if (!SRCSET_DESCRIPTOR_RE.test(token)) {
        // Invalid descriptor: drop the rest of this candidate at the next
        // top-level comma. Never rewind — browsers still parse later candidates.
        skipToTopLevelComma();
        return;
      }
      skipWs();
    }
  };

  while (i < input.length) {
    skipWs();
    while (i < input.length && input[i] === ",") {
      i += 1;
      skipWs();
    }
    if (i >= input.length) break;

    let url;
    if (input.slice(i, i + 5).toLowerCase() === "data:") {
      // data:[header],[payload...] — commas belong to the URL until whitespace.
      const headerComma = input.indexOf(",", i);
      if (headerComma === -1) {
        let end = i;
        while (end < input.length && !isAsciiWhitespace(input[end])) end += 1;
        url = input.slice(i, end);
        i = end;
      } else {
        let end = headerComma + 1;
        while (end < input.length && !isAsciiWhitespace(input[end])) end += 1;
        url = input.slice(i, end);
        i = end;
      }
    } else {
      // Non-data: URL continues through commas until ASCII whitespace.
      let end = i;
      while (end < input.length && !isAsciiWhitespace(input[end])) end += 1;
      url = input.slice(i, end);
      i = end;
    }

    // HTML srcset: trailing commas on the URL end the candidate (no
    // descriptors). Leaving them attached makes skipDescriptors consume the
    // next remote URL as an "invalid descriptor".
    let endedByTrailingComma = false;
    while (url.endsWith(",")) {
      url = url.slice(0, -1);
      endedByTrailingComma = true;
    }

    if (!endedByTrailingComma) skipDescriptors();
    if (i < input.length && input[i] === ",") i += 1;
    if (url) yield url;
  }
}

/**
 * srcset / imagesrcset: "url [descriptor], url [descriptor], ...".
 * Any absolute http(s) or protocol-relative URL candidate is remote.
 *
 * Two passes:
 * 1) Tokenize with ASCII whitespace preserved so a tab between a data:
 *    candidate and a remote candidate cannot glue them into one data URL.
 * 2) Re-check after removing URL-ignored whitespace (TAB/LF/FF/CR) so
 *    scheme-embedded tabs like htt&tab;ps:// still classify as remote.
 */
function srcsetHasRemoteUrl(value) {
  const decoded = decodeHtmlCharacterReferences(value);
  const passes = [decoded, decoded.replace(/[\t\n\f\r]+/g, "")];
  for (const forParse of passes) {
    for (const url of srcsetUrlTokens(forParse)) {
      const normalized = url
        .replace(URL_IGNORED_WHITESPACE_RE, "")
        .replace(URL_EDGE_C0_OR_SPACE_RE, "")
        .replace(/\\/g, "/");
      if (isRemoteResourceUrlDecoded(normalized)) return true;
      if (/&[a-z][a-z0-9]*;/i.test(url)) return true;
    }
  }
  return false;
}

function attrHasRemoteResource(name, value) {
  if (SRCSET_ATTRS.has(name)) return srcsetHasRemoteUrl(value);
  return isRemoteResourceUrl(value);
}

/**
 * Attribute tokenizer: quoted and unquoted values, names lowercased.
 * HTML keeps the first duplicate attribute; later duplicates are ignored.
 * Leading `/` between tag name and attrs is skipped (slash transition).
 */
function parseHtmlAttrs(attrText) {
  const attrs = {};
  if (!attrText) return attrs;
  const text = attrText.replace(/^[/\t\n\f\r ]+/, "");
  ATTR_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_TOKEN_RE.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function hasRemoteResourceTag(html) {
  for (const { tag, attrText, inSvgContext } of iterateOpenTags(html)) {
    const isSvgOnly = SVG_ONLY_RESOURCE_TAGS.has(tag);
    if (isSvgOnly) {
      if (!inSvgContext) continue;
    } else if (!REMOTE_RESOURCE_TAGS.has(tag)) {
      continue;
    }
    if (FORBIDDEN_EMBED_TAGS.has(tag)) return true;

    const attrs = parseHtmlAttrs(attrText);
    for (const attr of REMOTE_RESOURCE_ATTRS) {
      if (attr in attrs && attrHasRemoteResource(attr, attrs[attr])) return true;
    }
  }
  return false;
}

/** 日历上真实存在吗。Date.parse 会把 2026-02-31 悄悄进位成 3 月 3 日，不能用。 */
function isRealDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 只在 <head> 范围内找元数据，避免正文里的示例代码被误读。 */
function headOf(html) {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : html;
}

function parseTitle(head) {
  const m = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : "";
}

/** 解析 <meta name=... content=...>，属性顺序任意。 */
function parseMetas(head) {
  const out = {};
  for (const tag of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = {};
    for (const a of tag[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
      attrs[a[1].toLowerCase()] = a[2];
    }
    if (attrs.name) out[attrs.name.toLowerCase()] = (attrs.content ?? "").trim();
  }
  return out;
}

function splitTags(raw) {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

export const PRIMARY_TOPICS = Object.freeze([
  {
    slug: "product-xray",
    title: "产品 X-Ray",
    english: "Product X-Ray",
    description: "从可见界面一路追到本地包、网络边界与真实运行链路。",
    matchTags: ["Grok Bot", "Computer History", "视频理解", "Claude Desktop"],
  },
  {
    slug: "agent-architecture",
    title: "Agent 架构",
    english: "Agent Architecture",
    description: "上下文、工具、权限、记忆与执行边界的工程拆解。",
    matchTags: ["Agent", "Agent 架构", "Agent 工具链", "Claude Code", "Codex"],
  },
  {
    slug: "benchmarks-runtime",
    title: "工具与运行时实测",
    english: "Benchmarks & Runtime",
    description: "用同题、同机和可复现数据判断工具究竟快在哪里。",
    matchTags: ["Bun", "测评", "运行时", "本地模型", "模型评测"],
  },
  {
    slug: "models-training",
    title: "模型与训练",
    english: "Models & Training",
    description: "模型架构、后训练、合成数据与规模化管线的证据笔记。",
    matchTags: ["LLM", "训练管线", "后训练", "合成数据", "模型竞争", "RL", "MoE"],
  },
  {
    slug: "people-history",
    title: "技术人物与历史",
    english: "People & History",
    description: "沿着人物、产品和关键决策，还原技术如何走到今天。",
    matchTags: ["人物", "AI 历史", "商业史"],
  },
]);

/** 文章可以链接外部来源，但样式、脚本与媒体必须随文章目录一起搬得走。 */
function assertSelfContained(html, where) {
  if (hasRemoteResourceTag(html) || REMOTE_CSS_RESOURCE_RE.test(html)) {
    throw new Error(`${where}: 引用了外部资源；请删除它或下载到文章目录后使用相对路径`);
  }
}

export function stripHtml(value) {
  return value
    .replace(/<(?:script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|ensp|emsp);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function estimateReadingMinutes(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const text = stripHtml(body);
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latinWords = text.match(/[A-Za-z0-9][A-Za-z0-9_.'/-]*/g)?.length ?? 0;
  return Math.max(1, Math.ceil(cjk / 450 + latinWords / 220));
}

/**
 * 从一篇文章的 HTML 解析元数据。
 * 缺必需字段或格式非法时抛错——绝不用文件名/当天日期兜底。
 */
export function parsePost(html, slug, where = slug) {
  const head = headOf(html);
  const title = parseTitle(head);
  const metas = parseMetas(head);

  if (!title) {
    throw new Error(`${where}: 缺少 <title>，无法确定文章标题`);
  }
  const date = metas.date;
  if (!date) {
    throw new Error(`${where}: 缺少 <meta name="date" content="YYYY-MM-DD">`);
  }
  if (!DATE_RE.test(date) || !isRealDate(date)) {
    throw new Error(`${where}: date "${date}" 不是合法的 YYYY-MM-DD`);
  }
  const updated = metas.updated ?? "";
  if (updated && (!DATE_RE.test(updated) || !isRealDate(updated))) {
    throw new Error(`${where}: updated "${updated}" 不是合法的 YYYY-MM-DD`);
  }
  if (updated && updated < date) {
    throw new Error(`${where}: updated "${updated}" 不能早于 date "${date}"`);
  }
  assertSelfContained(html, where);

  return {
    slug,
    url: `/posts/${slug}/`,
    title,
    date,
    updated,
    description: metas.description ?? "",
    tags: splitTags(metas.tags),
    draft: metas.draft === "true",
    featured: metas.featured === "true",
  };
}

export function primaryTopicForPost(post) {
  const tags = new Set(post.tags);
  const topic = PRIMARY_TOPICS.find((candidate) =>
    candidate.matchTags.some((tag) => tags.has(tag)),
  );
  if (!topic) {
    throw new Error(`文章 ${post.slug} 的标签无法归入任何主专题`);
  }
  return topic;
}

export function groupByPrimaryTopic(posts) {
  const grouped = new Map(PRIMARY_TOPICS.map((topic) => [topic.slug, []]));
  for (const post of posts) grouped.get(primaryTopicForPost(post).slug).push(post);
  return PRIMARY_TOPICS.map((topic) => ({ ...topic, posts: grouped.get(topic.slug) })).filter(
    (topic) => topic.posts.length,
  );
}

/**
 * 扫描文章根目录，返回按日期倒序的文章列表。
 * 目录不存在时返回空数组（还没写文章是合法状态，不是错误）。
 */
export function readPosts(postsDir) {
  if (!fs.existsSync(postsDir)) return [];

  const posts = [];
  const seen = new Map();

  for (const entry of fs.readdirSync(postsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const indexPath = path.join(postsDir, entry.name, "index.html");
    if (!fs.existsSync(indexPath)) {
      throw new Error(`posts/${entry.name}/ 下没有 index.html —— 一篇文章必须有入口页`);
    }

    const slug = entry.name.toLowerCase();
    if (seen.has(slug)) {
      throw new Error(`slug "${slug}" 重复：${seen.get(slug)} 与 ${entry.name} 会产生同一个 URL`);
    }
    seen.set(slug, entry.name);

    const where = `posts/${entry.name}/index.html`;
    const html = fs.readFileSync(indexPath, "utf8");
    const post = parsePost(html, slug, where);
    if (post.draft) continue;

    let topic;
    try {
      topic = primaryTopicForPost(post);
    } catch (error) {
      throw new Error(`${where}: ${error.message}`);
    }

    posts.push({
      ...post,
      readingMinutes: estimateReadingMinutes(html),
      topic,
    });
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/** 标签 → 文章列表，标签按文章数倒序。 */
export function groupByTag(posts) {
  const map = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(post);
    }
  }
  return [...map.entries()]
    .map(([tag, items]) => ({ tag, posts: items }))
    .sort((a, b) => b.posts.length - a.posts.length || a.tag.localeCompare(b.tag));
}

/** 按年份分组，年份倒序。 */
export function groupByYear(posts) {
  const map = new Map();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(post);
  }
  return [...map.entries()]
    .map(([year, items]) => ({ year, posts: items }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

/** 首页只保留一个明确主推和最多四篇最新文章。 */
export function selectHomepagePosts(posts, warn = console.warn) {
  const featuredPosts = posts.filter((post) => post.featured);
  if (featuredPosts.length > 1) {
    const [keep, ...rest] = featuredPosts;
    warn(
      `多篇 featured，首页只保留日期最新的一篇：${keep.slug}。其余不会出现在首页主推：${rest.map((post) => post.slug).join(", ")}`,
    );
  }

  const featured = featuredPosts[0] ?? posts[0] ?? null;
  const recent = posts.filter((post) => post !== featured).slice(0, 4);
  return { featured, recent };
}
