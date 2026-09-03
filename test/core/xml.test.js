import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closeUnclosedXmlTags,
  escapeXmlAttr,
  escapeXmlText,
  findUnboundXmlPrefixes,
  looksLikeXml,
  stripTrailingXmlJunk,
  wrapWithXmlNamespaces,
  XML_SYNTHETIC_NS,
} from "../../src/core/xml.js";

describe("xml helpers", () => {
  it("reconhece XML", () => {
    assert.equal(looksLikeXml("<user id='1'/>"), true);
    assert.equal(looksLikeXml('{"a":1}'), false);
  });

  it("remove lixo após a tag final", () => {
    assert.equal(stripTrailingXmlJunk("<a/>  ,;"), "<a/>");
  });

  it("fecha tags abertas", () => {
    assert.equal(closeUnclosedXmlTags("<root><item>"), "<root><item></item></root>");
    assert.equal(closeUnclosedXmlTags("<root/>"), "<root/>");
  });

  it("descarta tag incompleta no fim e fecha o restante", () => {
    assert.equal(closeUnclosedXmlTags("<root><item"), "<root></root>");
  });

  it("encontra prefixos sem xmlns", () => {
    assert.deepEqual(findUnboundXmlPrefixes("<soap:Envelope/>"), ["soap"]);
    assert.deepEqual(findUnboundXmlPrefixes('<a xmlns:soap="urn:x"><soap:X/></a>'), []);
  });

  it("envolve fragmento com namespaces sintéticos", () => {
    const wrapped = wrapWithXmlNamespaces("<soap:X/>");
    assert.match(wrapped, new RegExp(`xmlns:soap="${XML_SYNTHETIC_NS}soap"`));
  });

  it("escapa texto e atributos", () => {
    assert.equal(escapeXmlText('a<b>&"'), "a&lt;b&gt;&amp;\"");
    assert.equal(escapeXmlAttr('a"b'), "a&quot;b");
  });
});
