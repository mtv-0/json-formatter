import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatValueLabel, treeToPlainText } from "../../src/format/tree.js";

describe("tree", () => {
  it("rotula primitivos", () => {
    assert.deepEqual(formatValueLabel(null), { text: "null", cls: "null" });
    assert.deepEqual(formatValueLabel(true), { text: "true", cls: "boolean" });
    assert.deepEqual(formatValueLabel(3), { text: "3", cls: "number" });
    assert.equal(formatValueLabel("hi").text, '"hi"');
  });

  it("serializa objeto e array", () => {
    const text = treeToPlainText({
      user: { name: "Ana" },
      tags: ["a"],
    });
    assert.match(text, /^\{\}$/m);
    assert.match(text, /user \{\}/);
    assert.match(text, /name: "Ana"/);
    assert.match(text, /tags \[\]/);
    assert.match(text, /\[0\]: "a"/);
  });
});
