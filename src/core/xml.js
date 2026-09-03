import { stripBom } from "./text.js";

export const XML_FRAGMENT_ROOT = "jf-fragment";

export const XML_SYNTHETIC_NS = "urn:jf-ns:";

export function looksLikeXml(text) {
  const t = text.trim();
  return t.startsWith("<");
}

export function stripTrailingXmlJunk(text) {
  return text.replace(/>[\s,;]+$/g, ">");
}

export function isReservedXmlPrefix(prefix) {
  const lower = prefix.toLowerCase();
  return lower === "xml" || lower === "xmlns";
}

export function findUnboundXmlPrefixes(text) {
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

export function wrapWithXmlNamespaces(inner) {
  const prefixes = findUnboundXmlPrefixes(inner);
  if (!prefixes.length) return null;
  const attrs = prefixes
    .map((prefix) => `xmlns:${prefix}="${XML_SYNTHETIC_NS}${prefix}"`)
    .join(" ");
  return `<${XML_FRAGMENT_ROOT} ${attrs}>${inner}</${XML_FRAGMENT_ROOT}>`;
}

export function isSyntheticXmlns(attr) {
  return (
    (attr.name.startsWith("xmlns:") || attr.name === "xmlns") &&
    String(attr.value).startsWith(XML_SYNTHETIC_NS)
  );
}

export function closeUnclosedXmlTags(text) {
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

export function xmlAttemptSources(text) {
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

export function xmlParserError(doc) {
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

export function parseXmlDocument(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

export function parseXml(input) {
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

export function xmlElementToValue(el) {
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

export function xmlToObject(doc) {
  const root = doc.documentElement;
  if (doc.__fragment) {
    return xmlElementToValue(root);
  }
  return { [root.nodeName]: xmlElementToValue(root) };
}

export function escapeXmlText(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXmlAttr(str) {
  return escapeXmlText(str).replace(/"/g, "&quot;");
}

export function serializeXmlNode(node, parts, indent) {
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

export function serializeXml(doc, { pretty = true, originalText = "" } = {}) {
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
