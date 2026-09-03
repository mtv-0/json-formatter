import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseStructured,
  tryParseStructured,
} from "../../src/core/structured.js";

describe("structured parse", () => {
  it("classifica JSON", () => {
    const parsed = parseStructured('{"a":1}');
    assert.equal(parsed.kind, "json");
    assert.deepEqual(parsed.value, { a: 1 });
  });

  it("recua para texto quando a entrada é inválida", () => {
    const parsed = tryParseStructured("não é json nem xml");
    assert.equal(parsed.kind, "text");
    assert.equal(parsed.value, "não é json nem xml");
  });

  it("falha em entrada vazia", () => {
    assert.throws(() => parseStructured(" \n "), /vazia/);
  });
});
