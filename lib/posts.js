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
  "track",
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
 * `noscript` is not listed here — scripting-disabled clients parse its body as
 * HTML, while scripting-enabled clients treat it as RAWTEXT. The scanner runs
 * both interpretations (see `hasRemoteResourceTag`).
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
  // `<plaintext>` enters the plaintext state through EOF (no end tag).
  "plaintext",
]);

/**
 * HTML "special" category (subset used when foreign-content end tags are
 * reprocessed in the HTML insertion mode). A mismatched end tag is ignored
 * when the current node is one of these.
 */
const HTML_SPECIAL_TAGS = new Set([
  "address",
  "applet",
  "area",
  "article",
  "aside",
  "base",
  "basefont",
  "bgsound",
  "blockquote",
  "body",
  "br",
  "button",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "iframe",
  "img",
  "input",
  "keygen",
  "li",
  "link",
  "listing",
  "main",
  "marquee",
  "menu",
  "meta",
  "nav",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "ol",
  "p",
  "param",
  "plaintext",
  "pre",
  "script",
  "search",
  "section",
  "select",
  "source",
  "style",
  "summary",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul",
  "wbr",
  "xmp",
]);

/**
 * HTML void elements are never kept on the open-element stack. Pushing them
 * (e.g. `<br>` inside SVG `foreignObject`) would make a later end tag for the
 * integration point look mismatched and leave HTML depth active incorrectly.
 */
const HTML_VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * HTML start tags that exit SVG/MathML foreign content (HTML tree builder
 * "in foreign content" → pop until an HTML element / integration point, then
 * reprocess). Without this, a `<p>` (etc.) inside `<svg>` stays foreign and
 * can hide later HTML resource tags behind RAWTEXT/RCDATA mismatches.
 */
const FOREIGN_CONTENT_BREAKOUT_TAGS = new Set([
  "b",
  "big",
  "blockquote",
  "body",
  "br",
  "center",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "hr",
  "i",
  "img",
  "li",
  "listing",
  "menu",
  "meta",
  "nobr",
  "ol",
  "p",
  "pre",
  "ruby",
  "s",
  "small",
  "span",
  "strong",
  "strike",
  "sub",
  "sup",
  "table",
  "tt",
  "u",
  "ul",
  "var",
]);

/** True when a start tag in SVG/MathML must break out to HTML. */
function isForeignContentBreakoutStartTag(tag, attrText) {
  if (FOREIGN_CONTENT_BREAKOUT_TAGS.has(tag)) return true;
  // HTML: `<font>` with color/face/size also exits foreign content.
  if (tag !== "font") return false;
  const attrs = parseHtmlAttrs(attrText);
  return "color" in attrs || "face" in attrs || "size" in attrs;
}

/**
 * MathML text integration points: their children are parsed as HTML, so
 * HTML raw-text elements (`title`, `textarea`, …) enter RCDATA/RAWTEXT.
 */
const MATHML_TEXT_INTEGRATION_POINTS = new Set([
  "mi",
  "mo",
  "mn",
  "ms",
  "mtext",
]);

/**
 * Explicit MathML exceptions under text integration points: these stay in the
 * MathML namespace even though other children of `mtext`/`mi`/… are HTML.
 */
const MATHML_INTEGRATION_EXCEPTIONS = new Set(["mglyph", "malignmark"]);

/** ASCII-only case fold (HTML tag/attribute names); no Unicode mappings. */
function asciiLowerCase(value) {
  return String(value).replace(/[A-Z]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 32),
  );
}

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

/** True when `text` at `from` is an ASCII-insensitive match for lowercase `word`. */
function asciiStartsWith(text, from, wordLower) {
  if (from + wordLower.length > text.length) return false;
  for (let j = 0; j < wordLower.length; j += 1) {
    let a = text.charCodeAt(from + j);
    if (a >= 65 && a <= 90) a += 32;
    if (a !== wordLower.charCodeAt(j)) return false;
  }
  return true;
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
 *
 * A leading `=` in the before-attribute-name state starts a parse-error
 * attribute name (it is not a value delimiter), so `<img =" >` must close at
 * the first `>` rather than entering quoted mode at `"`.
 */
function skipTagRemainder(text, from) {
  let k = from;
  let quote = null;
  let afterEquals = false;
  let inAttrName = false;
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
    if (isAsciiWhitespace(ch)) {
      inAttrName = false;
      k += 1;
      continue;
    }
    if (ch === "/") {
      // Solidus ends the current attribute name (self-closing state). Clear
      // inAttrName so a following `=` starts a new name, not a value.
      inAttrName = false;
      k += 1;
      continue;
    }
    if (ch === "=") {
      if (inAttrName) {
        afterEquals = true;
        inAttrName = false;
      } else {
        // Leading `=` begins an attribute name (`="` is name `="`, not a value).
        inAttrName = true;
      }
      k += 1;
      continue;
    }
    if (ch === ">") return k + 1;
    inAttrName = true;
    k += 1;
  }
  return text.length;
}

/**
 * Skip an HTML bogus comment / markup declaration / PI starting at `<` where
 * the next char is `!` (not `<!--`) or `?`. Bogus comments and PIs end at the
 * first `>`. A real `<!DOCTYPE …>` must honor quoted public/system identifiers
 * and the `[`…`]` internal subset so a `>` inside those regions is not the
 * terminator.
 */
function skipBogusCommentOrDeclaration(text, start) {
  // `<!DOCTYPE` (ASCII case-insensitive) — quote-aware / subset-aware closer.
  if (
    text[start + 1] === "!" &&
    asciiStartsWith(text, start + 2, "doctype")
  ) {
    let i = start + 9; // past `<!DOCTYPE`
    let quote = null;
    let inSubset = false;
    while (i < text.length) {
      const ch = text[i];
      if (inSubset) {
        // Internal subset lasts through `]`; `>` inside it is ordinary text.
        if (ch === "]") inSubset = false;
        i += 1;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === "[") {
        inSubset = true;
        i += 1;
        continue;
      }
      if (ch === ">") return i + 1;
      i += 1;
    }
    return text.length;
  }
  const gt = text.indexOf(">", start + 2);
  return gt === -1 ? text.length : gt + 1;
}

/**
 * Skip an SVG/MathML CDATA section starting at `<![CDATA[`. Returns the index
 * just past `]]>`, or `text.length` if unclosed.
 */
function skipCdataSection(text, start) {
  const end = text.indexOf("]]>", start + 9);
  return end === -1 ? text.length : end + 3;
}

/**
 * If `text` at `closeAt` (`</…`) is an appropriate end tag for `tag`, return
 * the index just past it; otherwise `-1`. Name must be followed by whitespace,
 * `/`, or `>` — `</scriptx>` must not close `<script>`.
 */
function endTagCloseIndex(text, closeAt, tag) {
  const close = `</${tag}`;
  if (!asciiStartsWith(text, closeAt, close)) return -1;
  let k = closeAt + close.length;
  if (k >= text.length) return text.length;
  const ch = text[k];
  if (ch === ">" || ch === "/" || isAsciiWhitespace(ch)) {
    return skipTagRemainder(text, k);
  }
  return -1;
}

/**
 * Advance past a RAWTEXT/RCDATA element body (non-script). End-tag scanning is
 * quote-aware so a `>` inside a quoted attribute does not terminate early.
 */
function skipRawTextBody(text, from, tag) {
  const close = `</${tag}`;
  let pos = from;
  while (pos < text.length) {
    const closeAt = indexOfAsciiIgnoreCase(text, close, pos);
    if (closeAt === -1) return text.length;
    const after = endTagCloseIndex(text, closeAt, tag);
    if (after !== -1) return after;
    pos = closeAt + 1;
  }
  return text.length;
}

/**
 * Script data / escaped / double-escaped states (HTML tokenizer). A textual
 * `</script>` inside `<!--<script>…` only leaves double-escaped state; the
 * real closer is a later `</script>`.
 */
function skipScriptBody(text, from) {
  let i = from;
  /** @type {"data" | "escaped" | "double"} */
  let state = "data";

  const isEndTagDelimiter = (ch) =>
    ch === ">" || ch === "/" || isAsciiWhitespace(ch);

  /** After matching ASCII "script" starting at `nameStart`, check delimiter. */
  const scriptNameDelimited = (nameStart) => {
    const end = nameStart + 6;
    if (end > text.length) return false;
    return end === text.length || isEndTagDelimiter(text[end]);
  };

  while (i < text.length) {
    if (state === "data") {
      const lt = text.indexOf("<", i);
      if (lt === -1) return text.length;
      if (text.startsWith("<!--", lt)) {
        state = "escaped";
        i = lt + 4;
        continue;
      }
      if (text.startsWith("</", lt)) {
        const after = endTagCloseIndex(text, lt, "script");
        if (after !== -1) return after;
      }
      i = lt + 1;
      continue;
    }

    if (state === "escaped") {
      if (text.startsWith("-->", i)) {
        state = "data";
        i += 3;
        continue;
      }
      if (text[i] !== "<") {
        i += 1;
        continue;
      }
      if (text.startsWith("</", i)) {
        const after = endTagCloseIndex(text, i, "script");
        if (after !== -1) return after;
        i += 1;
        continue;
      }
      // Escaped less-than: letter starts double-escape start ("script").
      if (i + 1 < text.length && /[a-zA-Z]/.test(text[i + 1])) {
        if (asciiStartsWith(text, i + 1, "script") && scriptNameDelimited(i + 1)) {
          state = "double";
          i += 1 + 6;
          continue;
        }
      }
      i += 1;
      continue;
    }

    // double-escaped
    if (text.startsWith("-->", i)) {
      state = "data";
      i += 3;
      continue;
    }
    if (text[i] !== "<") {
      i += 1;
      continue;
    }
    if (text.startsWith("</", i)) {
      // `</script` + delimiter leaves double-escaped → escaped (does not close).
      if (asciiStartsWith(text, i + 2, "script") && scriptNameDelimited(i + 2)) {
        state = "escaped";
        i += 2 + 6;
        continue;
      }
    } else if (i + 1 < text.length && /[a-zA-Z]/.test(text[i + 1])) {
      // Double-escape end: `<script` + delimiter stays in double-escaped.
      if (asciiStartsWith(text, i + 1, "script") && scriptNameDelimited(i + 1)) {
        i += 1 + 6;
        continue;
      }
    }
    i += 1;
  }
  return text.length;
}

/**
 * Decode HTML character references in attribute values before URL checks.
 * Browsers decode &colon; / &#x3a; / &#58; (semicolon optional for numeric
 * refs) prior to fetching; raw-text checks would otherwise miss remotes.
 *
 * Named refs are case-sensitive (`&colon;` → `:`, `&Colon;` → U+2237).
 * Unknown named refs are left intact and later fail-closed in URL checks.
 */
const HTML_NAMED_REFS = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", "\u00a0"],
  ["colon", ":"],
  ["Colon", "\u2237"],
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
    // HTML accepts either `x` or `X` after `&#` for hexadecimal references.
    /&(?:#[xX]([0-9a-fA-F]+)(?:;|(?![0-9a-fA-F]))|#([0-9]+)(?:;|(?![0-9]))|([A-Za-z][A-Za-z0-9]*);)/g,
    (entity, hex, dec, named) => {
      if (hex !== undefined || dec !== undefined) {
        const code =
          hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
        return decodeNumericCharacterReference(code);
      }
      return HTML_NAMED_REFS.get(named) ?? entity;
    },
  );
}

/**
 * Scan open tags with quote-aware attribute regions so a quoted `>` cannot
 * truncate the tag before resource attributes (`alt=">" srcset="https://…"`).
 * HTML allows `/` between the tag name and attributes (`<img/src=…>`); only a
 * solidus in the before-attribute-name state (not inside an unquoted value)
 * sets the self-closing flag.
 *
 * Open-element tracking keeps SVG/MathML namespace depth accurate across HTML
 * integration points (`foreignObject` / `desc` / `title`, MathML text points
 * / qualifying `annotation-xml`) and ignores foreign end tags the HTML tree
 * builder would drop (e.g. `</svg>` while a special HTML `div` is current).
 *
 * @param {string} html
 * @param {{ noscriptRawtext?: boolean }} [options]
 */
function* iterateOpenTags(html, options = {}) {
  const noscriptRawtext = options.noscriptRawtext === true;
  const text = String(html);
  let i = 0;
  /** @type {Array<{ tag: string, ns: "html" | "svg" | "math" }>} */
  const openElements = [];

  const currentNs = () =>
    openElements.length > 0 ? openElements[openElements.length - 1].ns : "html";
  const inSvgNs = () => currentNs() === "svg";
  const inMathNs = () => currentNs() === "math";

  /** True when MathML `annotation-xml` is an HTML integration point. */
  const isAnnotationXmlHtmlIntegration = (attrText) => {
    const encoding = parseHtmlAttrs(attrText).encoding;
    if (encoding === undefined) return false;
    // Browsers decode character references in attribute values before the
    // integration-point check (`text&sol;html` / `text&#47;html` → text/html).
    const folded = asciiLowerCase(decodeHtmlCharacterReferences(encoding).trim());
    return folded === "text/html" || folded === "application/xhtml+xml";
  };

  /**
   * Pop for an end tag using foreign-content + HTML "any other end tag" rules
   * so mismatched `</svg>` inside a special HTML element is ignored.
   */
  const popEndTag = (endTag) => {
    if (openElements.length === 0) return;
    let n = openElements.length - 1;
    while (n >= 0) {
      const el = openElements[n];
      if (el.tag === endTag) {
        openElements.length = n;
        return;
      }
      if (el.ns === "html") {
        for (let j = n; j >= 0; j -= 1) {
          const node = openElements[j];
          if (node.tag === endTag) {
            openElements.length = j;
            return;
          }
          if (HTML_SPECIAL_TAGS.has(node.tag)) return;
        }
        return;
      }
      n -= 1;
    }
  };

  while (i < text.length) {
    const start = text.indexOf("<", i);
    if (start === -1) break;
    const next = text[start + 1];
    // Skip HTML comments, including abrupt closes and end-bang `--!>`.
    if (text.startsWith("<!--", start)) {
      i = commentEndIndex(text, start);
      continue;
    }
    // In SVG/MathML, `<![CDATA[` … `]]>` is a CDATA section (not a bogus
    // declaration ending at the first `>`).
    if (
      next === "!" &&
      (inSvgNs() || inMathNs()) &&
      text.startsWith("<![CDATA[", start)
    ) {
      i = skipCdataSection(text, start);
      continue;
    }
    // Bogus comments / declarations / PIs end at the first `>`.
    // `%` is not a bogus-comment opener in HTML — `<% …>` leaves following
    // markup (e.g. `<img>`) as normal tokens the browser will parse.
    if (next === "!" || next === "?") {
      i = skipBogusCommentOrDeclaration(text, start);
      continue;
    }
    // End tags: update the open-element stack, then skip the tag.
    // A non-letter after `</` is an HTML bogus comment ending at the first `>`.
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
      const endTag = asciiLowerCase(text.slice(start + 2, j));
      i = skipTagRemainder(text, j);
      // Foreign-content breakout end tags: `</p>` / `</br>` leave SVG/MathML
      // the same way the matching start tags do, then are reprocessed in HTML.
      if (
        (endTag === "p" || endTag === "br") &&
        (currentNs() === "svg" || currentNs() === "math")
      ) {
        while (openElements.length > 0 && currentNs() !== "html") {
          openElements.pop();
        }
      } else {
        popEndTag(endTag);
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
    const tag = asciiLowerCase(text.slice(start + 1, j));

    // Optional slash transition between tag name and attributes. A solidus
    // here enters the self-closing start-tag state (not part of a value).
    let selfClosing = false;
    while (j < text.length && (text[j] === "/" || isAsciiWhitespace(text[j]))) {
      if (text[j] === "/") {
        selfClosing = true;
        j += 1;
        if (j < text.length && text[j] === ">") break;
        // `/` followed by anything other than `>` drops the self-closing flag
        // and reconsumes in before-attribute-name (HTML tokenizer).
        if (j < text.length && !isAsciiWhitespace(text[j]) && text[j] !== ">") {
          selfClosing = false;
          break;
        }
        continue;
      }
      selfClosing = false;
      j += 1;
    }

    const attrStart = j;
    let quote = null;
    // Only enter quoted mode after a value-delimiter `=` that follows an
    // attribute name. A leading `=` starts a parse-error name instead.
    // Quotes inside unquoted values (e.g. alt=x' src="…") are ordinary chars.
    let afterEquals = false;
    let inAttrName = false;
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
        // Unquoted attribute value — `/` belongs to the value, not self-closing.
        while (j < text.length && !isAsciiWhitespace(text[j]) && text[j] !== ">") j += 1;
        afterEquals = false;
        continue;
      }
      if (isAsciiWhitespace(ch)) {
        inAttrName = false;
        // Whitespace after `/` leaves self-closing-start-tag state without
        // setting the flag (`<svg foo/ >` stays open in the browser).
        selfClosing = false;
        j += 1;
        continue;
      }
      if (ch === "/") {
        // Before-attribute-name solidus → self-closing start-tag state.
        // Only `>` while still in that state sets the flag; anything else
        // (whitespace, another attr) abandons it. Clear inAttrName so a
        // following `=` is a new attribute name (`foo/="`), not a value.
        selfClosing = true;
        inAttrName = false;
        j += 1;
        if (j < text.length && text[j] !== ">") selfClosing = false;
        continue;
      }
      if (ch === "=") {
        if (inAttrName) {
          afterEquals = true;
          inAttrName = false;
        } else {
          inAttrName = true;
        }
        selfClosing = false;
        j += 1;
        continue;
      }
      if (ch === ">") break;
      // Another attribute name cancels a lone self-closing solidus.
      selfClosing = false;
      inAttrName = true;
      j += 1;
    }
    if (j >= text.length) break;

    const attrText = text.slice(attrStart, j);
    let parentNs = currentNs();

    // Foreign-content breakout: HTML tags such as `<p>` / `<img>` pop SVG or
    // MathML until an HTML node (or empty stack), then parse as HTML.
    if (
      (parentNs === "svg" || parentNs === "math") &&
      isForeignContentBreakoutStartTag(tag, attrText)
    ) {
      while (openElements.length > 0 && currentNs() !== "html") {
        openElements.pop();
      }
      parentNs = currentNs();
    }

    /** Namespace of this element. */
    let elementNs = parentNs;
    if (tag === "svg") elementNs = "svg";
    else if (tag === "math") elementNs = "math";
    else if (
      parentNs === "html" &&
      MATHML_INTEGRATION_EXCEPTIONS.has(tag) &&
      openElements.length >= 2 &&
      openElements[openElements.length - 1].tag === "#html-integration" &&
      openElements[openElements.length - 2].ns === "math"
    ) {
      // `mglyph` / `malignmark` under MathML text integration points stay MathML.
      elementNs = "math";
    } else if (parentNs === "html") elementNs = "html";
    else if (
      parentNs === "svg" &&
      (tag === "foreignobject" || tag === "desc" || tag === "title")
    ) {
      // SVG element that is an HTML integration point (children are HTML).
      elementNs = "svg";
    }

    // SVG-only resource tags (`use` / `feimage`) fetch only in SVG namespace.
    // Inside foreignObject/desc/title the parent ns is HTML, so they do not.
    yield { tag, attrText, inSvgContext: parentNs === "svg" };

    // Foreign elements honor `/>`; HTML raw-text ignores the self-closing flag.
    // HTML void elements are never kept on the stack (browser behavior).
    const honorSelfClosing = selfClosing && (elementNs === "svg" || elementNs === "math");
    const isHtmlVoid = elementNs === "html" && HTML_VOID_ELEMENTS.has(tag);
    if (!honorSelfClosing && !isHtmlVoid) {
      openElements.push({ tag, ns: elementNs });
      // HTML integration point: subsequent children are in the HTML namespace.
      if (
        elementNs === "svg" &&
        (tag === "foreignobject" || tag === "desc" || tag === "title")
      ) {
        openElements.push({ tag: "#html-integration", ns: "html" });
      } else if (
        elementNs === "math" &&
        (MATHML_TEXT_INTEGRATION_POINTS.has(tag) ||
          (tag === "annotation-xml" && isAnnotationXmlHtmlIntegration(attrText)))
      ) {
        openElements.push({ tag: "#html-integration", ns: "html" });
      }
    }

    i = j + 1;

    // Skip RAWTEXT/RCDATA contents so unmatched quotes inside script/style
    // cannot poison scanning past a real resource tag the browser loads.
    // Only HTML-namespace raw-text elements enter these states (SVG `<title>`
    // is an integration point, not HTML RCDATA).
    const isHtmlRawTextElement =
      (RAW_TEXT_TAGS.has(tag) || (tag === "noscript" && noscriptRawtext)) &&
      parentNs === "html";

    if (isHtmlRawTextElement && !honorSelfClosing) {
      // HTML `<plaintext>` consumes through EOF; end tags are not recognized.
      if (tag === "plaintext") {
        i = text.length;
      } else {
        i = tag === "script" ? skipScriptBody(text, i) : skipRawTextBody(text, i, tag);
        // Raw-text body skip consumes through the end tag; pop the element we
        // pushed (and leave any outer integration frame intact).
        if (
          openElements.length > 0 &&
          openElements[openElements.length - 1].tag === tag
        ) {
          openElements.pop();
        }
      }
    }
  }
}

/** HTML ASCII whitespace: TAB, LF, FF, CR, SPACE (U+0009/A/C/D/20). */
function isAsciiWhitespace(ch) {
  return ch === "\t" || ch === "\n" || ch === "\f" || ch === "\r" || ch === " ";
}

/**
 * URL-ignored ASCII whitespace removed throughout (TAB/LF/CR only). Form feed
 * is HTML whitespace for tokenization but is percent-encoded by the URL parser
 * rather than deleted from interiors — stripping it would invent absolute URLs
 * from same-origin relative ones (`htt&#12;ps://…`).
 */
const URL_IGNORED_WHITESPACE_RE = /[\t\n\r]+/g;
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
  // Named refs are case-sensitive — do not fold before the unresolved check.
  return /&[A-Za-z][A-Za-z0-9]*;/.test(decoded);
}

/**
 * HTML srcset density/width/height descriptors. Density uses a valid
 * non-negative floating-point number (including scientific notation like
 * `1e0x`) then `x`. Width/height are positive integers then `w` / `h`
 * (`0w`/`0h` are invalid and discarded; `h` is reserved for future
 * compatibility but still delimits candidates).
 */
const SRCSET_DESCRIPTOR_RE =
  /^(?:(?:\d+\.\d+|\d+\.?|\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)x$|^[1-9]\d*[wh]$/;

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
    let hasWidth = false;
    let hasDensity = false;
    let hasHeight = false;
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
        return false;
      }
      // Semantic constraints: at most one of each type; width and density are
      // mutually exclusive; height requires width (`1x 2x` / `100w 200w` drop).
      if (token.endsWith("w")) {
        if (hasWidth || hasDensity) {
          skipToTopLevelComma();
          return false;
        }
        hasWidth = true;
      } else if (token.endsWith("x")) {
        if (hasDensity || hasWidth) {
          skipToTopLevelComma();
          return false;
        }
        hasDensity = true;
      } else if (token.endsWith("h")) {
        if (hasHeight) {
          skipToTopLevelComma();
          return false;
        }
        hasHeight = true;
      }
      skipWs();
    }
    if (hasHeight && !hasWidth) return false;
    return true;
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

    let candidateValid = true;
    if (!endedByTrailingComma) candidateValid = skipDescriptors();
    if (i < input.length && input[i] === ",") i += 1;
    // Browsers discard the whole candidate on an invalid descriptor — do not
    // test that URL for remoteness (would false-positive self-contained posts).
    if (url && candidateValid) yield url;
  }
}

/**
 * srcset / imagesrcset: "url [descriptor], url [descriptor], ...".
 * Any absolute http(s) or protocol-relative URL candidate is remote.
 *
 * Tokenize with ASCII whitespace preserved so a tab between a data: candidate
 * and a remote candidate cannot glue them into one data URL. URL-parser
 * whitespace removal applies per URL token after tokenization — never to the
 * whole candidate list first (that would turn `htt&#9;ps://… 1x` into a remote
 * URL the browser never fetches).
 */
function srcsetHasRemoteUrl(value) {
  const decoded = decodeHtmlCharacterReferences(value);
  for (const url of srcsetUrlTokens(decoded)) {
    const normalized = url
      .replace(URL_IGNORED_WHITESPACE_RE, "")
      .replace(URL_EDGE_C0_OR_SPACE_RE, "")
      .replace(/\\/g, "/");
    if (isRemoteResourceUrlDecoded(normalized)) return true;
    if (/&[A-Za-z][A-Za-z0-9]*;/.test(url)) return true;
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
    const name = asciiLowerCase(match[1]);
    if (name in attrs) continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function scanRemoteResourceTag(html, options) {
  for (const { tag, attrText, inSvgContext } of iterateOpenTags(html, options)) {
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

/**
 * Detect remote resource tags. `noscript` is scanned under both scripting
 * modes: body-as-HTML (scripting disabled) and RAWTEXT (scripting enabled).
 */
function hasRemoteResourceTag(html) {
  return (
    scanRemoteResourceTag(html, { noscriptRawtext: false }) ||
    scanRemoteResourceTag(html, { noscriptRawtext: true })
  );
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
