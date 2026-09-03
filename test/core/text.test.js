import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compactPreview,
  countTextLines,
  escapeHtml,
  isMod,
  stripBom,
} from "../../src/core/text.js";

describe("text", () => {
  it("remove BOM", () => {
    assert.equal(stripBom("\uFEFF{ }"), "{ }");
    assert.equal(stripBom(null), "");
  });

  it("escapa HTML", () => {
    assert.equal(escapeHtml("<a & b>"), "&lt;a &amp; b&gt;");
  });

  it("gera preview compacto", () => {
    assert.equal(compactPreview("  foo   bar  "), "foo bar");
    assert.equal(compactPreview("x".repeat(10), 8), "xxxxxxxx…");
  });

  it("conta linhas", () => {
    assert.equal(countTextLines(""), 1);
    assert.equal(countTextLines("a\nb\n"), 3);
  });

  it("detecta atalho com Ctrl ou Meta", () => {
    assert.equal(isMod({ ctrlKey: true, metaKey: false }), true);
    assert.equal(isMod({ ctrlKey: false, metaKey: true }), true);
    assert.equal(isMod({ ctrlKey: false, metaKey: false }), false);
  });
});
