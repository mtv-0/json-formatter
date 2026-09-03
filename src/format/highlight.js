import { escapeHtml } from "../core/text.js";

export const TOKEN_RE =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

export function highlightLine(line) {
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

export function highlightXmlLine(line) {
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

export function isXmlBlockOpener(trimmed) {
  if (!trimmed.startsWith("<") || trimmed.startsWith("</") || trimmed.startsWith("<!")) {
    return false;
  }
  if (trimmed.startsWith("<?") || trimmed.endsWith("/>") || !trimmed.endsWith(">")) {
    return false;
  }
  if (/^<[^>]+>[\s\S]*<\/[^>]+>$/.test(trimmed)) return false;
  return true;
}
