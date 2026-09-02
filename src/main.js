const container = document.querySelector(".container");
const inputArea = document.querySelector(".large-area--input");
const inputAreaB = document.querySelector(".large-area--input-b");
const inputBoxB = document.querySelector(".editor-box--b");
const inputLabelA = document.querySelector(".input-label--a");
const inputLabelB = document.querySelector(".input-label--b");
const outputArea = document.querySelector(".large-area--output");
const outputBox = document.querySelector(".editor-box--output");
const formatButton = document.querySelector(".controls__button--format");
const minifyButton = document.querySelector(".controls__button--minify");
const treeButton = document.querySelector(".controls__button--tree");
const diffButton = document.querySelector(".controls__button--diff");
const historyButton = document.querySelector(".controls__button--history");
const clearButton = document.querySelector(".controls__button--clear");
const copyButton = document.querySelector(".copy-button");
const helpFab = document.querySelector(".help-fab");
const helpModal = document.querySelector(".modal--help");
const historyModal = document.querySelector(".modal--history");
const historyList = document.querySelector(".history-list");
const historyEmpty = document.querySelector(".history-empty");
const historyClearAll = document.querySelector(".history-clear-all");

/** Texto pronto para copiar */
let lastCopyText = "";
let toastEl = null;
let toastTimer = null;
let copyResetTimer = null;
let diffMode = false;

const HISTORY_KEY = "json-formatter-history";
const HISTORY_MAX = 25;

function countTextLines(text) {
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") count++;
  }
  return count;
}

function updateEditorLines(textarea) {
  const box = textarea.closest(".editor-box");
  if (!box) return;
  const gutter = box.querySelector(".editor-box__gutter");
  if (!gutter) return;

  const count = countTextLines(textarea.value);
  if (Number(gutter.dataset.count || 0) !== count) {
    gutter.dataset.count = String(count);
    let lines = "1";
    for (let i = 2; i <= count; i++) lines += `\n${i}`;
    gutter.textContent = lines;
    gutter.style.minWidth = `${Math.max(2, String(count).length) + 1.25}ch`;
  }
  gutter.scrollTop = textarea.scrollTop;
}

function bindEditorLines(textarea) {
  const sync = () => updateEditorLines(textarea);
  textarea.addEventListener("input", sync);
  textarea.addEventListener("scroll", () => {
    const gutter = textarea.closest(".editor-box")?.querySelector(".editor-box__gutter");
    if (gutter) gutter.scrollTop = textarea.scrollTop;
  });
  sync();
}

function setOutputGutterMode(innerLines, text = "") {
  if (!outputBox) return;
  outputBox.classList.toggle("has-inner-lines", innerLines);
  if (innerLines) return;

  const gutter = outputBox.querySelector(".editor-box__gutter");
  if (!gutter) return;
  const count = countTextLines(text);
  if (Number(gutter.dataset.count || 0) !== count) {
    gutter.dataset.count = String(count);
    let lines = "1";
    for (let i = 2; i <= count; i++) lines += `\n${i}`;
    gutter.textContent = lines;
    gutter.style.minWidth = `${Math.max(2, String(count).length) + 1.25}ch`;
  }
  gutter.scrollTop = outputArea.scrollTop;
}

const TOKEN_RE =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

const OUTPUT_MODE_CLASSES = ["is-error", "is-minified", "is-tree", "is-diff"];

function resetOutputMode(...modes) {
  outputArea.classList.remove(...OUTPUT_MODE_CLASSES);
  for (const mode of modes) {
    outputArea.classList.add(mode);
  }
}

function isMod(e) {
  return e.ctrlKey || e.metaKey;
}

/* =========================
   Parse inteligente (JSON / XML)
========================= */
function stripBom(input) {
  return String(input || "").replace(/^\uFEFF/, "");
}

function looksLikeJson(text) {
  const t = text.trim();
  if (!t) return false;
  const c = t[0];
  if (c === "{" || c === "[" || c === '"') return true;
  if (c === "t" || c === "f" || c === "n" || c === "-" || (c >= "0" && c <= "9")) {
    try {
      JSON.parse(t);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function looksLikeXml(text) {
  const t = text.trim();
  return t.startsWith("<");
}

function smartParseJson(input) {
  let text = stripBom(input).trim();
  if (!text) throw new SyntaxError("Entrada vazia");

  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);
  }

  const json = JSON.parse(text);
  deepParseNestedJson(json);
  return json;
}

const XML_FRAGMENT_ROOT = "jf-fragment";

function xmlParserError(doc) {
  const err =
    doc.querySelector("parsererror") ||
    doc.getElementsByTagName("parsererror")[0] ||
    doc.getElementsByTagNameNS("*", "parsererror")[0];
  if (!err && doc.documentElement?.nodeName !== "parsererror") return null;
  const node = err || doc.documentElement;
  const raw = node.textContent.replace(/\s+/g, " ").trim();
  const short = raw.replace(/^This page contains the following errors:\s*/i, "");
  return short.slice(0, 280) || "XML inválido";
}

function parseXmlDocument(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

const XML_SYNTHETIC_NS = "urn:jf-ns:";

function stripTrailingXmlJunk(text) {
  return text.replace(/>[\s,;]+$/g, ">");
}

function isReservedXmlPrefix(prefix) {
  const lower = prefix.toLowerCase();
  return lower === "xml" || lower === "xmlns";
}

function findUnboundXmlPrefixes(text) {
  const declared = new Set();
  const declRe = /\sxmlns:([A-Za-z_][\w.-]*)\s*=/gi;
  let match;
  while ((match = declRe.exec(text))) {
    declared.add(match[1]);
  }

  const used = new Set();
  const tagRe = /<\/?([A-Za-z_][\w.-]*):/g;
  while ((match = tagRe.exec(text))) {
    if (!isReservedXmlPrefix(match[1])) used.add(match[1]);
  }

  const attrRe = /(?:^|[\s"'<])([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g;
  while ((match = attrRe.exec(text))) {
    if (!isReservedXmlPrefix(match[1])) used.add(match[1]);
  }

  return [...used].filter((prefix) => !declared.has(prefix));
}

function wrapWithXmlNamespaces(inner) {
  const prefixes = findUnboundXmlPrefixes(inner);
  if (!prefixes.length) return null;
  const attrs = prefixes
    .map((prefix) => `xmlns:${prefix}="${XML_SYNTHETIC_NS}${prefix}"`)
    .join(" ");
  return `<${XML_FRAGMENT_ROOT} ${attrs}>${inner}</${XML_FRAGMENT_ROOT}>`;
}

function isSyntheticXmlns(attr) {
  return (
    (attr.name.startsWith("xmlns:") || attr.name === "xmlns") &&
    String(attr.value).startsWith(XML_SYNTHETIC_NS)
  );
}

function xmlAttemptSources(text) {
  const variants = [text];
  const repaired = closeUnclosedXmlTags(text);
  if (repaired !== text) variants.push(repaired);

  const attempts = [];
  const seen = new Set();
  const push = (source, fragment) => {
    if (!source || seen.has(source)) return;
    seen.add(source);
    attempts.push({ source, fragment });
  };

  for (const variant of variants) {
    push(variant, false);
    push(`<${XML_FRAGMENT_ROOT}>${variant}</${XML_FRAGMENT_ROOT}>`, true);
    push(wrapWithXmlNamespaces(variant), true);
  }
  return attempts;
}

function closeUnclosedXmlTags(text) {
  let source = text;
  const lastLt = source.lastIndexOf("<");
  const lastGt = source.lastIndexOf(">");
  if (lastLt > lastGt) {
    source = source.slice(0, lastLt).replace(/\s+$/, "");
  }

  const stack = [];
  const re =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/([\w:.-]+)[^>]*>|<([\w:.-]+)([^>]*)>/g;
  let match;
  while ((match = re.exec(source))) {
    const [, closingName, openingName, attrs = ""] = match;
    if (!closingName && !openingName) continue;
    if (closingName) {
      const name = closingName;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].toLowerCase() === name.toLowerCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (/\/\s*$/.test(attrs)) continue;
    stack.push(openingName);
  }

  if (!stack.length) return source;
  return `${source}${stack.reverse().map((name) => `</${name}>`).join("")}`;
}

function parseXml(input) {
  const text = stripTrailingXmlJunk(stripBom(input).trim());
  if (!text) throw new SyntaxError("Entrada vazia");

  let firstError = "";
  for (const attempt of xmlAttemptSources(text)) {
    const doc = parseXmlDocument(attempt.source);
    const error = xmlParserError(doc);
    if (error) {
      if (!firstError) firstError = error;
      continue;
    }
    if (!doc.documentElement) continue;
    if (attempt.fragment) doc.__fragment = true;
    return doc;
  }

  throw new SyntaxError(firstError || "XML inválido");
}

function xmlElementToValue(el) {
  const obj = {};
  for (const attr of el.attributes) {
    if (isSyntheticXmlns(attr)) continue;
    obj[`@${attr.name}`] = attr.value;
  }

  const elements = [];
  let text = "";
  for (const child of el.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      elements.push(child);
    } else if (
      child.nodeType === Node.TEXT_NODE ||
      child.nodeType === Node.CDATA_SECTION_NODE
    ) {
      text += child.textContent;
    }
  }

  const trimmed = text.trim();
  if (elements.length === 0) {
    if (Object.keys(obj).length === 0) return trimmed;
    if (trimmed) obj["#text"] = trimmed;
    return obj;
  }

  for (const child of elements) {
    const name = child.nodeName;
    const value = xmlElementToValue(child);
    if (!Object.prototype.hasOwnProperty.call(obj, name)) {
      obj[name] = value;
    } else if (Array.isArray(obj[name])) {
      obj[name].push(value);
    } else {
      obj[name] = [obj[name], value];
    }
  }
  if (trimmed) obj["#text"] = trimmed;
  return obj;
}

function xmlToObject(doc) {
  const root = doc.documentElement;
  if (doc.__fragment) {
    return xmlElementToValue(root);
  }
  return { [root.nodeName]: xmlElementToValue(root) };
}

function escapeXmlText(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttr(str) {
  return escapeXmlText(str).replace(/"/g, "&quot;");
}

function serializeXmlNode(node, parts, indent) {
  const pretty = indent !== null;
  const pad = pretty ? "  ".repeat(indent) : "";
  const nl = pretty ? "\n" : "";

  if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
    parts.push(`<!DOCTYPE ${node.name}>${nl}`);
    return;
  }

  if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    const data = node.data ? ` ${node.data}` : "";
    parts.push(`<?${node.target}${data}?>${nl}`);
    return;
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    parts.push(`${pad}<!--${node.data}-->${nl}`);
    return;
  }

  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    parts.push(`${pad}<![CDATA[${node.data}]]>${nl}`);
    return;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const t = pretty ? node.textContent.trim() : node.textContent;
    if (!t || (pretty && !t.trim())) return;
    parts.push(pretty ? `${pad}${escapeXmlText(t)}${nl}` : escapeXmlText(t));
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const attrs = [...node.attributes]
    .filter((a) => !isSyntheticXmlns(a))
    .map((a) => `${a.name}="${escapeXmlAttr(a.value)}"`)
    .join(" ");
  const attrStr = attrs ? ` ${attrs}` : "";
  const children = [...node.childNodes].filter((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      return child.textContent.trim().length > 0;
    }
    return (
      child.nodeType === Node.ELEMENT_NODE ||
      child.nodeType === Node.COMMENT_NODE ||
      child.nodeType === Node.CDATA_SECTION_NODE ||
      child.nodeType === Node.PROCESSING_INSTRUCTION_NODE
    );
  });

  if (children.length === 0) {
    parts.push(`${pad}<${node.nodeName}${attrStr}/>${nl}`);
    return;
  }

  const onlyText =
    children.length === 1 &&
    (children[0].nodeType === Node.TEXT_NODE ||
      children[0].nodeType === Node.CDATA_SECTION_NODE);

  if (onlyText && children[0].nodeType === Node.TEXT_NODE) {
    const t = pretty ? children[0].textContent.trim() : children[0].textContent;
    parts.push(
      `${pad}<${node.nodeName}${attrStr}>${escapeXmlText(t)}</${node.nodeName}>${nl}`,
    );
    return;
  }

  parts.push(`${pad}<${node.nodeName}${attrStr}>${nl}`);
  for (const child of children) {
    serializeXmlNode(child, parts, pretty ? indent + 1 : null);
  }
  parts.push(`${pad}</${node.nodeName}>${nl}`);
}

function serializeXml(doc, { pretty = true, originalText = "" } = {}) {
  const parts = [];
  const source = stripBom(originalText);
  if (/^\s*<\?xml\b/i.test(source)) {
    const decl = source.match(/^\s*<\?xml\b[^?]*\?>/i);
    parts.push(decl ? decl[0].trim() : '<?xml version="1.0" encoding="UTF-8"?>');
    if (pretty) parts.push("\n");
  }

  const nodes = doc.__fragment
    ? doc.documentElement.childNodes
    : doc.childNodes;

  for (const child of nodes) {
    if (
      child.nodeType === Node.PROCESSING_INSTRUCTION_NODE &&
      child.target.toLowerCase() === "xml"
    ) {
      continue;
    }
    serializeXmlNode(child, parts, pretty ? 0 : null);
  }

  return parts.join("").replace(/\s+$/, "");
}

function parseStructured(input) {
  const text = stripBom(input).trim();
  if (!text) throw new SyntaxError("Entrada vazia");

  if (looksLikeJson(text)) {
    return { kind: "json", value: smartParseJson(input) };
  }

  if (looksLikeXml(text)) {
    const doc = parseXml(input);
    return {
      kind: "xml",
      value: xmlToObject(doc),
      doc,
      raw: input,
    };
  }

  return { kind: "json", value: smartParseJson(input) };
}

function tryParseStructured(input) {
  try {
    return parseStructured(input);
  } catch {
    return { kind: "text", value: stripBom(input) };
  }
}

function deepParseNestedJson(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === "string") {
        const parsed = tryParseJsonString(item);
        if (parsed !== undefined) {
          value[i] = parsed;
          deepParseNestedJson(parsed);
        }
      } else if (item && typeof item === "object") {
        deepParseNestedJson(item);
      }
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item === "string") {
      const parsed = tryParseJsonString(item);
      if (parsed !== undefined) {
        value[key] = parsed;
        deepParseNestedJson(parsed);
      }
    } else if (item && typeof item === "object") {
      deepParseNestedJson(item);
    }
  }
}

function tryParseJsonString(str) {
  const trimmed = str.trim();
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightLine(line) {
  const escaped = escapeHtml(line);
  return escaped
    .replace(TOKEN_RE, (match) => {
      let cls = "number";
      if (match.startsWith('"')) cls = /:$/.test(match) ? "key" : "string";
      else if (/true|false/.test(match)) cls = "boolean";
      else if (/null/.test(match)) cls = "null";
      return `<span class="${cls}">${match}</span>`;
    })
    .replace(/[{}[\]]/g, (m) => `<span class="brace">${m}</span>`);
}

function highlightXmlLine(line) {
  const trimmed = line.trim();
  if (
    trimmed.startsWith("<!--") ||
    trimmed.startsWith("<?") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<![CDATA[")
  ) {
    return `<span class="xml-comment">${escapeHtml(line)}</span>`;
  }

  return escapeHtml(line).replace(
    /(&lt;\/?)([\w:.-]+)([^&]*?)(\/?&gt;)/g,
    (_, open, name, rest, close) => {
      const attrs = rest.replace(
        /([\w:.-]+)(=)(&quot;[\s\S]*?&quot;)/g,
        '<span class="key">$1</span>$2<span class="string">$3</span>',
      );
      return `<span class="xml-punct">${open}</span><span class="xml-tag">${name}</span>${attrs}<span class="xml-punct">${close}</span>`;
    },
  );
}

function isXmlBlockOpener(trimmed) {
  if (!trimmed.startsWith("<") || trimmed.startsWith("</") || trimmed.startsWith("<!")) {
    return false;
  }
  if (trimmed.startsWith("<?") || trimmed.endsWith("/>") || !trimmed.endsWith(">")) {
    return false;
  }
  if (/^<[^>]+>[\s\S]*<\/[^>]+>$/.test(trimmed)) return false;
  return true;
}

function compactPreview(text, max = 80) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/* =========================
   Formatação com highlight + collapse
========================= */
function formatJSONWithHighlight(obj, container) {
  const jsonText = JSON.stringify(obj, null, 2);
  lastCopyText = jsonText;
  renderHighlightedLines(jsonText, container, {
    highlight: highlightLine,
    opensBlock: (trimmed) => /[{[]\s*$/.test(trimmed),
  });
}

function formatXmlWithHighlight(doc, originalText, container) {
  const xmlText = serializeXml(doc, { pretty: true, originalText });
  lastCopyText = xmlText;
  renderHighlightedLines(xmlText, container, {
    highlight: highlightXmlLine,
    opensBlock: isXmlBlockOpener,
  });
}

function renderHighlightedLines(text, container, { highlight, opensBlock }) {
  resetOutputMode();
  container.replaceChildren();
  showCopyButton();
  setOutputGutterMode(true);

  const lines = text.split("\n");
  const fragment = document.createDocumentFragment();
  const allBraces = [];
  const lineWrappers = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const indentCount = (line.match(/^(\s*)/) || [""])[0].length / 2;
    const trimmed = line.trim();
    const opens = opensBlock(trimmed);

    const wrapper = document.createElement("div");
    wrapper.className = "line-wrapper";
    wrapper.dataset.indent = String(indentCount);
    wrapper.dataset.index = String(idx);
    if (opens) {
      wrapper.classList.add("block-opener");
      wrapper.dataset.collapsed = "false";
    }

    const foldToggle = document.createElement("span");
    foldToggle.className = "fold-toggle";
    foldToggle.textContent = opens ? "▼" : "";
    foldToggle.setAttribute("aria-hidden", "true");

    const lineNumber = document.createElement("span");
    lineNumber.className = "line-number";
    lineNumber.textContent = String(idx + 1);

    const lineContent = document.createElement("div");
    lineContent.className = "line";

    const indentWrapper = document.createElement("div");
    indentWrapper.className = "indent-lines";
    for (let i = 0; i < indentCount; i++) {
      const il = document.createElement("div");
      il.className = "indent-line";
      indentWrapper.appendChild(il);
    }

    const content = document.createElement("span");
    content.className = "content";
    content.innerHTML = highlight(line);

    lineContent.appendChild(indentWrapper);
    lineContent.appendChild(content);
    wrapper.appendChild(foldToggle);
    wrapper.appendChild(lineNumber);
    wrapper.appendChild(lineContent);
    fragment.appendChild(wrapper);

    content.querySelectorAll(".brace").forEach((b) => allBraces.push(b));
    lineWrappers.push(wrapper);
  }

  container.appendChild(fragment);
  linkMatchingBraces(allBraces);
  bindCollapse(lineWrappers, lines);
}

function linkMatchingBraces(allBraces) {
  const stack = [];
  allBraces.forEach((brace, i) => {
    const ch = brace.textContent;
    if (ch === "{" || ch === "[") {
      stack.push({ brace, index: i });
    } else {
      const opener = stack.pop();
      if (opener) {
        brace.dataset.match = String(opener.index);
        opener.brace.dataset.match = String(i);
      }
    }
  });
}

outputArea.addEventListener("click", (e) => {
  const brace = e.target.closest(".brace");
  if (!brace || !outputArea.contains(brace)) return;

  outputArea.querySelectorAll(".brace-active").forEach((b) => {
    b.classList.remove("brace-active");
  });

  const match = brace.dataset.match;
  if (match == null) return;

  brace.classList.add("brace-active");
  const braces = outputArea.querySelectorAll(".brace");
  const pair = braces[Number(match)];
  if (pair) pair.classList.add("brace-active");
});

function bindCollapse(lineWrappers, lines) {
  for (const line of lineWrappers) {
    if (!line.classList.contains("block-opener")) continue;

    const toggle = line.querySelector(".fold-toggle");
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCollapse(line, lineWrappers, lines);
    });
  }
}

function toggleCollapse(line, lineWrappers, lines) {
  const isCollapsed = line.dataset.collapsed === "true";
  const newCollapsed = !isCollapsed;
  line.dataset.collapsed = String(newCollapsed);

  const toggle = line.querySelector(".fold-toggle");
  toggle.textContent = newCollapsed ? "▶" : "▼";

  const baseIndent = Number(line.dataset.indent);
  const startIndex = Number(line.dataset.index);

  let dotsLine = line.nextElementSibling;
  if (dotsLine && !dotsLine.classList.contains("dots-line")) {
    dotsLine = null;
  }

  if (newCollapsed && !dotsLine) {
    const lineText = lines[startIndex].trim();
    if (lineText.endsWith("[")) {
      let itemCount = 0;
      for (let i = startIndex + 1; i < lineWrappers.length; i++) {
        const next = lineWrappers[i];
        const nextIndent = Number(next.dataset.indent);
        if (nextIndent <= baseIndent) break;
        if (nextIndent === baseIndent + 1) {
          const nextLine = lines[i].trim();
          if (!/^[\]}],?$/.test(nextLine)) itemCount++;
        }
      }

      dotsLine = document.createElement("div");
      dotsLine.className = "line-wrapper dots-line";
      dotsLine.innerHTML = `
        <span class="fold-toggle"></span>
        <span class="line-number"></span>
        <div class="line">
          <span class="content dots">... [${itemCount} ${itemCount === 1 ? "item" : "itens"}]</span>
        </div>
      `;
      line.after(dotsLine);
    }
  } else if (!newCollapsed && dotsLine) {
    dotsLine.remove();
  }

  for (let i = startIndex + 1; i < lineWrappers.length; i++) {
    const next = lineWrappers[i];
    const nextIndent = Number(next.dataset.indent);
    if (nextIndent <= baseIndent) break;

    if (newCollapsed) {
      next.style.display = "none";
      const nextDots = next.nextElementSibling;
      if (nextDots?.classList.contains("dots-line")) {
        nextDots.style.display = "none";
      }
      continue;
    }

    let shouldShow = true;
    let currentIndent = nextIndent;

    for (let j = i - 1; j > startIndex; j--) {
      const potentialAncestor = lineWrappers[j];
      const ancestorIndent = Number(potentialAncestor.dataset.indent);

      if (ancestorIndent < currentIndent) {
        currentIndent = ancestorIndent;
        if (
          potentialAncestor.classList.contains("block-opener") &&
          potentialAncestor.dataset.collapsed === "true"
        ) {
          shouldShow = false;
          break;
        }
      }
    }

    if (next.classList.contains("dots-line")) {
      const prevElement = next.previousElementSibling;
      if (prevElement?.classList.contains("block-opener")) {
        next.style.display =
          prevElement.dataset.collapsed === "true" && shouldShow ? "" : "none";
      }
    } else {
      next.style.display = shouldShow ? "" : "none";
    }
  }
}

/* =========================
   JSON → árvore
========================= */
function formatValueLabel(value) {
  if (value === null) return { text: "null", cls: "null" };
  if (typeof value === "boolean") return { text: String(value), cls: "boolean" };
  if (typeof value === "number") return { text: String(value), cls: "number" };
  return { text: JSON.stringify(String(value)), cls: "" };
}

function appendTreeNodes(container, value, prefix = "", isLast = true) {
  const fragment = document.createDocumentFragment();

  const walk = (node, currentPrefix, last) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        const itemLast = index === node.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        const line = document.createElement("div");
        line.className = "tree-line";

        const conn = document.createElement("span");
        conn.className = "tree-connector";
        conn.textContent = currentPrefix + connector;

        const key = document.createElement("span");
        key.className = "tree-key";
        key.textContent = `[${index}]`;

        line.appendChild(conn);
        line.appendChild(key);

        if (item !== null && typeof item === "object") {
          const typeHint = document.createElement("span");
          typeHint.className = "tree-connector";
          typeHint.textContent = Array.isArray(item) ? " []" : " {}";
          line.appendChild(typeHint);
          fragment.appendChild(line);
          walk(item, nextPrefix, itemLast);
        } else {
          const sep = document.createElement("span");
          sep.className = "tree-connector";
          sep.textContent = ": ";
          const val = document.createElement("span");
          const formatted = formatValueLabel(item);
          val.className = `tree-value${formatted.cls ? ` ${formatted.cls}` : ""}`;
          val.textContent = formatted.text;
          line.appendChild(sep);
          line.appendChild(val);
          fragment.appendChild(line);
        }
      });
      return;
    }

    if (node !== null && typeof node === "object") {
      const entries = Object.entries(node);
      entries.forEach(([keyName, item], index) => {
        const itemLast = index === entries.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        const line = document.createElement("div");
        line.className = "tree-line";

        const conn = document.createElement("span");
        conn.className = "tree-connector";
        conn.textContent = currentPrefix + connector;

        const key = document.createElement("span");
        key.className = "tree-key";
        key.textContent = keyName;

        line.appendChild(conn);
        line.appendChild(key);

        if (item !== null && typeof item === "object") {
          const typeHint = document.createElement("span");
          typeHint.className = "tree-connector";
          typeHint.textContent = Array.isArray(item) ? " []" : " {}";
          line.appendChild(typeHint);
          fragment.appendChild(line);
          walk(item, nextPrefix, itemLast);
        } else {
          const sep = document.createElement("span");
          sep.className = "tree-connector";
          sep.textContent = ": ";
          const val = document.createElement("span");
          const formatted = formatValueLabel(item);
          val.className = `tree-value${formatted.cls ? ` ${formatted.cls}` : ""}`;
          val.textContent = formatted.text;
          line.appendChild(sep);
          line.appendChild(val);
          fragment.appendChild(line);
        }
      });
    }
  };

  const root = document.createElement("div");
  root.className = "tree-line";
  const rootLabel = document.createElement("span");
  rootLabel.className = "tree-key";
  rootLabel.textContent = Array.isArray(value) ? "[]" : "{}";
  root.appendChild(rootLabel);
  fragment.appendChild(root);

  walk(value, prefix, isLast);
  container.appendChild(fragment);
}

function treeToPlainText(value, prefix = "", isLast = true) {
  const lines = [];

  const walk = (node, currentPrefix, last) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        const itemLast = index === node.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        if (item !== null && typeof item === "object") {
          lines.push(
            `${currentPrefix}${connector}[${index}] ${Array.isArray(item) ? "[]" : "{}"}`,
          );
          walk(item, nextPrefix, itemLast);
        } else {
          lines.push(
            `${currentPrefix}${connector}[${index}]: ${formatValueLabel(item).text}`,
          );
        }
      });
      return;
    }

    if (node !== null && typeof node === "object") {
      const entries = Object.entries(node);
      entries.forEach(([keyName, item], index) => {
        const itemLast = index === entries.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        if (item !== null && typeof item === "object") {
          lines.push(
            `${currentPrefix}${connector}${keyName} ${Array.isArray(item) ? "[]" : "{}"}`,
          );
          walk(item, nextPrefix, itemLast);
        } else {
          lines.push(
            `${currentPrefix}${connector}${keyName}: ${formatValueLabel(item).text}`,
          );
        }
      });
    }
  };

  lines.push(Array.isArray(value) ? "[]" : "{}");
  walk(value, prefix, isLast);
  return lines.join("\n");
}

/* =========================
   Diff
========================= */
function pathJoin(base, key) {
  if (base === "") {
    return typeof key === "number" ? `[${key}]` : key;
  }
  return typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function typeLabel(value) {
  const t = valueType(value);
  if (t === "array") return `array[${value.length}]`;
  if (t === "object") return `object{${Object.keys(value).length}}`;
  if (t === "string") return `string(${value.length})`;
  return t;
}

function formatValueForDiff(value, max = 280) {
  if (value === undefined) return "undefined";
  let text;
  try {
    text = JSON.stringify(value, null, value !== null && typeof value === "object" ? 2 : undefined);
  } catch {
    text = String(value);
  }
  if (text.length > max) {
    return `${text.slice(0, max)}…`;
  }
  return text;
}

function collectDiff(a, b, path = "", out = []) {
  if (Object.is(a, b)) return out;

  const aObj = a !== null && typeof a === "object";
  const bObj = b !== null && typeof b === "object";

  if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) {
    out.push(buildChange("changed", path || "$", a, b));
    return out;
  }

  if (Array.isArray(a)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const next = pathJoin(path, i);
      if (i >= a.length) {
        out.push(buildChange("added", next, undefined, b[i]));
      } else if (i >= b.length) {
        out.push(buildChange("removed", next, a[i], undefined));
      } else {
        collectDiff(a[i], b[i], next, out);
      }
    }
    return out;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const next = pathJoin(path, key);
    const hasA = Object.prototype.hasOwnProperty.call(a, key);
    const hasB = Object.prototype.hasOwnProperty.call(b, key);
    if (!hasA) {
      out.push(buildChange("added", next, undefined, b[key]));
    } else if (!hasB) {
      out.push(buildChange("removed", next, a[key], undefined));
    } else {
      collectDiff(a[key], b[key], next, out);
    }
  }
  return out;
}

function diffLineOps(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : dp[i - 1][j] > dp[i][j - 1]
            ? dp[i - 1][j]
            : dp[i][j - 1];
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "equal", a: a[i - 1], lineA: i, lineB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "added", b: b[j - 1], lineB: j });
      j--;
    } else {
      ops.push({ type: "removed", a: a[i - 1], lineA: i });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

function collectTextDiff(textA, textB) {
  if (textA === textB) return [];

  const linesA = String(textA).split(/\r?\n/);
  const linesB = String(textB).split(/\r?\n/);

  let start = 0;
  while (
    start < linesA.length &&
    start < linesB.length &&
    linesA[start] === linesB[start]
  ) {
    start++;
  }

  let endA = linesA.length - 1;
  let endB = linesB.length - 1;
  while (endA >= start && endB >= start && linesA[endA] === linesB[endB]) {
    endA--;
    endB--;
  }

  const midA = linesA.slice(start, endA + 1);
  const midB = linesB.slice(start, endB + 1);
  let ops;

  if (midA.length * midB.length > 400000) {
    ops = [];
    const pairs = Math.min(midA.length, midB.length);
    for (let i = 0; i < pairs; i++) {
      if (midA[i] === midB[i]) {
        ops.push({
          type: "equal",
          a: midA[i],
          lineA: start + i + 1,
          lineB: start + i + 1,
        });
      } else {
        ops.push({ type: "removed", a: midA[i], lineA: start + i + 1 });
        ops.push({ type: "added", b: midB[i], lineB: start + i + 1 });
      }
    }
    for (let i = pairs; i < midA.length; i++) {
      ops.push({ type: "removed", a: midA[i], lineA: start + i + 1 });
    }
    for (let i = pairs; i < midB.length; i++) {
      ops.push({ type: "added", b: midB[i], lineB: start + i + 1 });
    }
  } else {
    ops = diffLineOps(midA, midB).map((op) => {
      const next = { ...op };
      if (next.lineA != null) next.lineA += start;
      if (next.lineB != null) next.lineB += start;
      return next;
    });
  }

  const changes = [];
  let hunk = [];

  const flushHunk = () => {
    if (!hunk.length) return;
    const removed = hunk.filter((o) => o.type === "removed");
    const added = hunk.filter((o) => o.type === "added");
    const pairs = Math.min(removed.length, added.length);
    for (let i = 0; i < pairs; i++) {
      changes.push(
        buildChange(
          "changed",
          `linha ${removed[i].lineA} → ${added[i].lineB}`,
          removed[i].a,
          added[i].b,
        ),
      );
    }
    for (let i = pairs; i < removed.length; i++) {
      changes.push(
        buildChange("removed", `linha ${removed[i].lineA}`, removed[i].a, undefined),
      );
    }
    for (let i = pairs; i < added.length; i++) {
      changes.push(
        buildChange("added", `linha ${added[i].lineB}`, undefined, added[i].b),
      );
    }
    hunk = [];
  };

  for (const op of ops) {
    if (op.type === "equal") {
      flushHunk();
    } else {
      hunk.push(op);
    }
  }
  flushHunk();
  return changes;
}

function buildChange(type, path, oldValue, newValue) {
  const change = {
    type,
    path,
    oldValue,
    newValue,
    oldType: oldValue === undefined ? null : valueType(oldValue),
    newType: newValue === undefined ? null : valueType(newValue),
  };
  change.details = describeChange(change);
  return change;
}

function describeChange(change) {
  const details = [];

  if (change.type === "added") {
    details.push({
      label: "O que aconteceu",
      text: `Campo adicionado em B (${typeLabel(change.newValue)})`,
    });
    details.push({
      label: "Valor em B",
      text: formatValueForDiff(change.newValue),
      tone: "added",
    });
    return details;
  }

  if (change.type === "removed") {
    details.push({
      label: "O que aconteceu",
      text: `Campo removido em B (existia em A como ${typeLabel(change.oldValue)})`,
    });
    details.push({
      label: "Valor em A",
      text: formatValueForDiff(change.oldValue),
      tone: "removed",
    });
    return details;
  }

  const { oldValue: a, newValue: b, oldType, newType } = change;

  if (oldType !== newType) {
    details.push({
      label: "O que aconteceu",
      text: `Tipo alterado: ${typeLabel(a)} → ${typeLabel(b)}`,
    });
  } else if (oldType === "string") {
    details.push({
      label: "O que aconteceu",
      text: describeStringChange(a, b),
    });
  } else if (oldType === "number") {
    const delta = b - a;
    const sign = delta > 0 ? "+" : "";
    details.push({
      label: "O que aconteceu",
      text: `Número alterado (${sign}${delta})`,
    });
  } else if (oldType === "boolean") {
    details.push({
      label: "O que aconteceu",
      text: `Booleano alterado: ${a} → ${b}`,
    });
  } else {
    details.push({
      label: "O que aconteceu",
      text: `Valor ${oldType} alterado`,
    });
  }

  details.push({
    label: "Antes (A)",
    text: formatValueForDiff(a),
    tone: "removed",
  });
  details.push({
    label: "Depois (B)",
    text: formatValueForDiff(b),
    tone: "added",
  });

  if (oldType === "string" && newType === "string") {
    const inline = buildStringInlineDiff(a, b);
    if (inline) {
      details.push({
        label: "Diferença na string",
        html: inline,
      });
    }
  }

  return details;
}

function describeStringChange(a, b) {
  if (a === b) return "Strings iguais";
  const parts = [`String alterada (${a.length} → ${b.length} chars)`];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const removed = a.slice(start, endA + 1);
  const added = b.slice(start, endB + 1);

  if (removed || added) {
    parts.push(`trecho na posição ${start}`);
    if (removed) parts.push(`removeu ${JSON.stringify(removed)}`);
    if (added) parts.push(`inseriu ${JSON.stringify(added)}`);
  }

  return parts.join(" · ");
}

function buildStringInlineDiff(a, b) {
  if (a === b || a.length > 400 || b.length > 400) return null;

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const prefix = escapeHtml(a.slice(0, start));
  const suffix = escapeHtml(a.slice(endA + 1));
  const removed = escapeHtml(a.slice(start, endA + 1));
  const added = escapeHtml(b.slice(start, endB + 1));

  if (!removed && !added) return null;

  return (
    `<span class="diff-inline-same">${prefix}</span>` +
    (removed ? `<span class="diff-inline-del">${removed}</span>` : "") +
    (added ? `<span class="diff-inline-ins">${added}</span>` : "") +
    `<span class="diff-inline-same">${suffix}</span>`
  );
}

function renderDiff(changes, { kind = "json" } = {}) {
  resetOutputMode("is-diff");
  outputArea.replaceChildren();
  setOutputGutterMode(true);

  const fragment = document.createDocumentFragment();
  const summary = document.createElement("div");
  summary.className = "diff-summary";

  const equivalentLabel = {
    json: "JSON A e JSON B são equivalentes.",
    xml: "XML A e XML B são equivalentes.",
    text: "Textos A e B são equivalentes.",
  };

  if (changes.length === 0) {
    summary.textContent = "Nenhuma diferença encontrada.";
    fragment.appendChild(summary);
    const empty = document.createElement("div");
    empty.className = "diff-empty";
    empty.textContent = equivalentLabel[kind] || equivalentLabel.text;
    fragment.appendChild(empty);
    lastCopyText = "Nenhuma diferença encontrada.";
    outputArea.appendChild(fragment);
    showCopyButton();
    return;
  }

  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const changed = changes.filter((c) => c.type === "changed").length;
  const kindHint = kind === "text" ? " (texto)" : kind === "xml" ? " (XML)" : "";
  summary.textContent = `${changes.length} diferença(s)${kindHint}: +${added}  −${removed}  ~${changed}`;
  fragment.appendChild(summary);

  const plainLines = [summary.textContent, ""];

  for (const change of changes) {
    const card = document.createElement("article");
    card.className = `diff-card diff-card--${change.type}`;

    const header = document.createElement("div");
    header.className = "diff-card__header";

    const tag = document.createElement("span");
    tag.className = "diff-tag";
    tag.textContent =
      change.type === "added"
        ? "+ add"
        : change.type === "removed"
          ? "− rem"
          : "~ chg";

    const pathEl = document.createElement("span");
    pathEl.className = "diff-path";
    pathEl.textContent = change.path;

    const typeHint = document.createElement("span");
    typeHint.className = "diff-type-hint";
    if (change.type === "changed") {
      typeHint.textContent = `${typeLabel(change.oldValue)} → ${typeLabel(change.newValue)}`;
    } else if (change.type === "added") {
      typeHint.textContent = typeLabel(change.newValue);
    } else {
      typeHint.textContent = typeLabel(change.oldValue);
    }

    header.appendChild(tag);
    header.appendChild(pathEl);
    header.appendChild(typeHint);
    card.appendChild(header);

    plainLines.push(`${tag.textContent} ${change.path} (${typeHint.textContent})`);

    for (const detail of change.details || []) {
      const block = document.createElement("div");
      block.className = "diff-block";
      if (detail.tone) block.classList.add(`diff-block--${detail.tone}`);

      const label = document.createElement("div");
      label.className = "diff-block__label";
      label.textContent = detail.label;

      const body = document.createElement("div");
      body.className = "diff-block__body";
      if (detail.html) {
        body.innerHTML = detail.html;
      } else {
        body.textContent = detail.text;
      }

      block.appendChild(label);
      block.appendChild(body);
      card.appendChild(block);

      plainLines.push(`  ${detail.label}: ${detail.text || body.textContent}`);
    }

    plainLines.push("");
    fragment.appendChild(card);
  }

  lastCopyText = plainLines.join("\n").trim();
  outputArea.appendChild(fragment);
  showCopyButton();
}

function setDiffMode(enabled) {
  diffMode = enabled;
  container.classList.toggle("is-diff", enabled);
  diffButton.classList.toggle("is-active", enabled);
  inputBoxB.hidden = !enabled;
  inputLabelA.hidden = !enabled;
  inputLabelB.hidden = !enabled;

  formatButton.textContent = enabled ? "Compare" : "Format";

  inputArea.setAttribute(
    "aria-label",
    enabled ? "Entrada A" : "Entrada JSON ou XML",
  );
  inputArea.placeholder = enabled
    ? "A: JSON, XML ou texto..."
    : "Cole JSON ou XML aqui... (Ctrl+Enter para formatar)";
  inputAreaB.setAttribute("aria-label", "Entrada B");
  inputAreaB.placeholder = "B: JSON, XML ou texto...";

  if (enabled) {
    updateEditorLines(inputAreaB);
    inputAreaB.focus();
  }
}

function toggleDiffMode() {
  setDiffMode(!diffMode);
  if (diffMode) {
    showToast("Modo Diff ativo — Compare ou Ctrl+Shift+Enter");
  } else {
    showToast("Modo Diff desativado");
  }
}

/* =========================
   Histórico local
========================= */
const MODE_LABELS = {
  format: "Format",
  minify: "Minify",
  tree: "Tree",
  diff: "Diff",
};

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
}

function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;

  // Entradas antigas (só text/source)
  if (!item.mode) {
    const source = item.source || "format";
    if (source === "diff-a" || source === "diff-b") {
      return {
        ...item,
        mode: "diff",
        text: item.text || "",
        textB: "",
      };
    }
    return {
      ...item,
      mode: ["format", "minify", "tree"].includes(source) ? source : "format",
      text: item.text || "",
      textB: "",
    };
  }

  return {
    ...item,
    text: item.text || "",
    textB: item.textB || "",
  };
}

function pushHistoryEntry({ mode, text, textB = "" }) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const trimmedB = textB.trim();
  const items = getHistory().filter((raw) => {
    const item = normalizeHistoryItem(raw);
    if (!item) return false;
    if (mode === "diff") {
      return !(
        item.mode === "diff" &&
        item.text === trimmed &&
        item.textB === trimmedB
      );
    }
    return !(item.mode === mode && item.text === trimmed && !item.textB);
  });

  const label = MODE_LABELS[mode] || mode;
  const preview =
    mode === "diff"
      ? `${label} · ${compactPreview(trimmed, 36)} ↔ ${compactPreview(trimmedB, 36)}`
      : `${label} · ${compactPreview(trimmed)}`;

  items.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    text: trimmed,
    textB: mode === "diff" ? trimmedB : "",
    preview,
    ts: Date.now(),
  });
  setHistory(items);
}

function formatHistoryDate(ts) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function restoreHistoryItem(raw) {
  const item = normalizeHistoryItem(raw);
  if (!item) return;

  const mode = item.mode || "format";
  setDiffMode(mode === "diff");
  inputArea.value = item.text;
  inputAreaB.value = mode === "diff" ? item.textB : "";
  updateEditorLines(inputArea);
  updateEditorLines(inputAreaB);

  try {
    if (mode === "diff") {
      if (!item.textB.trim()) {
        showToast("Diff restaurado — complete o lado B", false, 2500);
      } else {
        applyDiff(item.text, item.textB);
        showToast("Diff restaurado");
      }
    } else if (mode === "minify") {
      applyMinify(item.text);
      showToast("Minify restaurado");
    } else if (mode === "tree") {
      applyTree(item.text);
      showToast("Tree restaurado");
    } else {
      applyFormat(item.text);
      showToast("Format restaurado");
    }
  } catch (e) {
    showError(`Não foi possível reprocessar:\n${e.message}`);
    showToast("Entrada restaurada (saída com erro)", true);
  }

  historyModal.close();
  inputArea.focus();
}

function renderHistoryList() {
  const items = getHistory()
    .map(normalizeHistoryItem)
    .filter(Boolean);
  historyList.replaceChildren();
  historyEmpty.hidden = items.length > 0;

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "history-item";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "history-item__main";
    main.title = "Restaurar no editor";

    const preview = document.createElement("span");
    preview.className = "history-item__preview";
    preview.textContent = item.preview || compactPreview(item.text);

    const meta = document.createElement("span");
    meta.className = "history-item__meta";
    const modeLabel = MODE_LABELS[item.mode] || item.mode || "Format";
    meta.textContent = `${modeLabel} · ${formatHistoryDate(item.ts)}`;

    main.appendChild(preview);
    main.appendChild(meta);
    main.addEventListener("click", () => restoreHistoryItem(item));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "history-item__delete";
    del.setAttribute("aria-label", "Remover item");
    del.textContent = "×";
    del.addEventListener("click", () => {
      setHistory(getHistory().filter((h) => h.id !== item.id));
      renderHistoryList();
    });

    li.appendChild(main);
    li.appendChild(del);
    historyList.appendChild(li);
  }
}

function openHistory() {
  renderHistoryList();
  historyModal.showModal();
}

/* =========================
   Saída / erros / copiar
========================= */
function showCopyButton() {
  copyButton.hidden = false;
}

function hideCopyButton() {
  copyButton.hidden = true;
  lastCopyText = "";
}

function showError(message) {
  hideCopyButton();
  resetOutputMode("is-error");
  outputArea.replaceChildren();
  outputArea.textContent = message;
  setOutputGutterMode(false, message);
}

function renderMinified(json) {
  const text = JSON.stringify(json);
  lastCopyText = text;
  resetOutputMode("is-minified");
  outputArea.replaceChildren();
  outputArea.textContent = text;
  setOutputGutterMode(false, text);
  showCopyButton();
}

function renderMinifiedXml(doc, originalText) {
  const text = serializeXml(doc, { pretty: false, originalText });
  lastCopyText = text;
  resetOutputMode("is-minified");
  outputArea.replaceChildren();
  outputArea.textContent = text;
  setOutputGutterMode(false, text);
  showCopyButton();
}

function renderTree(json) {
  lastCopyText = treeToPlainText(json);
  resetOutputMode("is-tree");
  outputArea.replaceChildren();
  appendTreeNodes(outputArea, json);
  setOutputGutterMode(true);
  showCopyButton();
}

async function copyOutput() {
  if (!lastCopyText) {
    showToast("Nada para copiar", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(lastCopyText);
    copyButton.textContent = "Copiado!";
    copyButton.classList.add("is-copied");
    showToast("Copiado para a área de transferência!");

    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyButton.textContent = "Copiar";
      copyButton.classList.remove("is-copied");
    }, 1500);
  } catch {
    showToast("Não foi possível copiar", true);
  }
}

function clearAll() {
  inputArea.value = "";
  inputAreaB.value = "";
  updateEditorLines(inputArea);
  updateEditorLines(inputAreaB);
  resetOutputMode();
  outputArea.replaceChildren();
  setOutputGutterMode(false, "");
  hideCopyButton();
  inputArea.focus();
}

/* =========================
   Toast
========================= */
function showToast(message, isError = false, duration = 2000) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast-message";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.classList.toggle("is-error", isError);
  toastEl.classList.remove("show");
  void toastEl.offsetWidth;
  toastEl.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, duration);
}

function applyFormat(text) {
  const parsed = parseStructured(text);
  if (parsed.kind === "xml") {
    formatXmlWithHighlight(parsed.doc, text, outputArea);
  } else {
    formatJSONWithHighlight(parsed.value, outputArea);
  }
}

function applyMinify(text) {
  const parsed = parseStructured(text);
  if (parsed.kind === "xml") {
    renderMinifiedXml(parsed.doc, text);
  } else {
    renderMinified(parsed.value);
  }
}

function applyTree(text) {
  const parsed = parseStructured(text);
  renderTree(parsed.value);
}

function applyDiff(textA, textB) {
  const a = tryParseStructured(textA);
  const b = tryParseStructured(textB);
  const structured =
    a.kind !== "text" &&
    b.kind !== "text" &&
    a.kind === b.kind;

  if (structured) {
    renderDiff(collectDiff(a.value, b.value), { kind: a.kind });
    return a.kind;
  }

  renderDiff(collectTextDiff(textA, textB), { kind: "text" });
  return "text";
}

/* =========================
   Ações
========================= */
function runFormat() {
  if (diffMode) {
    runDiff();
    return;
  }

  try {
    applyFormat(inputArea.value);
    pushHistoryEntry({ mode: "format", text: inputArea.value });
  } catch (e) {
    showError(`Entrada inválida!\n${e.message}`);
  }
}

function runMinify() {
  try {
    applyMinify(inputArea.value);
    pushHistoryEntry({ mode: "minify", text: inputArea.value });
  } catch (e) {
    showError(`Entrada inválida!\n${e.message}`);
  }
}

function runTree() {
  try {
    applyTree(inputArea.value);
    pushHistoryEntry({ mode: "tree", text: inputArea.value });
  } catch (e) {
    showError(`Entrada inválida!\n${e.message}`);
  }
}

function runDiff() {
  if (!diffMode) {
    setDiffMode(true);
    showToast("Modo Diff ativo — cole A e B");
    return;
  }

  const textA = inputArea.value;
  const textB = inputAreaB.value;
  if (!textA.trim() || !textB.trim()) {
    showError("Preencha A e B para comparar.");
    return;
  }

  try {
    applyDiff(textA, textB);
    pushHistoryEntry({
      mode: "diff",
      text: textA,
      textB: textB,
    });
  } catch (e) {
    showError(`Não foi possível comparar!\n${e.message}`);
  }
}

function openHelp() {
  helpModal.showModal();
}

function closeTopModal() {
  if (helpModal.open) helpModal.close();
  else if (historyModal.open) historyModal.close();
}

/* =========================
   Eventos
========================= */
formatButton.addEventListener("click", runFormat);
minifyButton.addEventListener("click", runMinify);
treeButton.addEventListener("click", runTree);
diffButton.addEventListener("click", toggleDiffMode);
historyButton.addEventListener("click", openHistory);
clearButton.addEventListener("click", clearAll);
copyButton.addEventListener("click", copyOutput);
helpFab.addEventListener("click", openHelp);
bindEditorLines(inputArea);
bindEditorLines(inputAreaB);
setOutputGutterMode(false, "");
outputArea.addEventListener("scroll", () => {
  if (!outputBox || outputBox.classList.contains("has-inner-lines")) return;
  const gutter = outputBox.querySelector(".editor-box__gutter");
  if (gutter) gutter.scrollTop = outputArea.scrollTop;
});

helpModal.querySelector(".modal__close").addEventListener("click", () => {
  helpModal.close();
});
historyModal.querySelector(".modal__close").addEventListener("click", () => {
  historyModal.close();
});

historyClearAll.addEventListener("click", () => {
  setHistory([]);
  renderHistoryList();
  showToast("Histórico limpo");
});

document.addEventListener("keydown", (e) => {
  const tag = e.target?.tagName;
  const typingInField = tag === "TEXTAREA" || tag === "INPUT";

  if (e.key === "Escape") {
    closeTopModal();
    return;
  }

  // ? abre ajuda (fora de campos, ou Ctrl+/)
  if (
    (e.key === "?" && !typingInField && !isMod(e)) ||
    (isMod(e) && e.key === "/")
  ) {
    e.preventDefault();
    openHelp();
    return;
  }

  if (!isMod(e)) return;

  const key = e.key.toLowerCase();

  if (key === "enter" && e.shiftKey) {
    e.preventDefault();
    runDiff();
    return;
  }

  if (key === "enter") {
    e.preventDefault();
    runFormat();
    return;
  }

  if (key === "m") {
    e.preventDefault();
    runMinify();
    return;
  }

  if (key === "t") {
    e.preventDefault();
    runTree();
    return;
  }

  if (key === "d") {
    e.preventDefault();
    toggleDiffMode();
    return;
  }

  if (key === "h") {
    e.preventDefault();
    openHistory();
    return;
  }

  if (key === "l") {
    e.preventDefault();
    clearAll();
    return;
  }

  if (key === "c" && e.shiftKey) {
    e.preventDefault();
    copyOutput();
  }
});
