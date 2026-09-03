import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeJson,
  smartParseJson,
  tryParseJsonString,
} from "../../src/core/json.js";

describe("json", () => {
  it("reconhece JSON por forma", () => {
    assert.equal(looksLikeJson('{"a":1}'), true);
    assert.equal(looksLikeJson("[1]"), true);
    assert.equal(looksLikeJson("true"), true);
    assert.equal(looksLikeJson("<root/>"), false);
    assert.equal(looksLikeJson("not json"), false);
  });

  it("parseia string JSON aninhada", () => {
    assert.deepEqual(tryParseJsonString('{"a":1}'), { a: 1 });
    assert.equal(tryParseJsonString("hello"), undefined);
    assert.equal(tryParseJsonString("{broken"), undefined);
  });

  it("expande JSON aninhado em strings", () => {
    const parsed = smartParseJson('{"payload":"{\\"ok\\":true}"}');
    assert.deepEqual(parsed, { payload: { ok: true } });
  });

  it("aceita JSON entre aspas", () => {
    const parsed = smartParseJson('"{\\"n\\":2}"');
    assert.deepEqual(parsed, { n: 2 });
  });

  it("rejeita entrada vazia", () => {
    assert.throws(() => smartParseJson("  "), /vazia/);
  });
});
