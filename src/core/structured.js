import { stripBom } from "./text.js";
import { looksLikeJson, smartParseJson } from "./json.js";
import { looksLikeXml, parseXml, xmlToObject } from "./xml.js";

export function parseStructured(input) {
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

export function tryParseStructured(input) {
  try {
    return parseStructured(input);
  } catch {
    return { kind: "text", value: stripBom(input) };
  }
}
