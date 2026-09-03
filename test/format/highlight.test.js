import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  highlightLine,
  highlightXmlLine,
  isXmlBlockOpener,
} from "../../src/format/highlight.js";

describe("highlight", () => {
  it("marca chave, string e número em JSON", () => {
    const html = highlightLine('  "age": 21');
    assert.match(html, /class="key"/);
    assert.match(html, /class="number"/);
  });

  it("marca boolean e null", () => {
    assert.match(highlightLine("true"), /class="boolean"/);
    assert.match(highlightLine("null"), /class="null"/);
  });

  it("marca tags XML", () => {
    const html = highlightXmlLine("<user id='1'/>");
    assert.match(html, /class="xml-tag"/);
    assert.match(html, /class="xml-punct"/);
  });

  it("identifica abridor de bloco XML", () => {
    assert.equal(isXmlBlockOpener("<root>"), true);
    assert.equal(isXmlBlockOpener("<root/>"), false);
    assert.equal(isXmlBlockOpener("</root>"), false);
    assert.equal(isXmlBlockOpener("<a>text</a>"), false);
  });
});
