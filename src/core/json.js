import { stripBom } from "./text.js";

export function looksLikeJson(text) {
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

export function tryParseJsonString(str) {
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

export function deepParseNestedJson(value) {
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

export function smartParseJson(input) {
  let text = stripBom(input).trim();
  if (!text) throw new SyntaxError("Entrada vazia");

  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);
  }

  const json = JSON.parse(text);
  deepParseNestedJson(json);
  return json;
}
