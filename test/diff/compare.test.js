import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareInputs } from "../../src/diff/compare.js";

describe("compareInputs", () => {
  it("compara JSON estruturado e por linhas", () => {
    const result = compareInputs(
      '{"name":"Ana","age":20}',
      '{"name":"Ana","age":21}',
    );
    assert.equal(result.kind, "json");
    assert.equal(result.git.identical, false);
    assert.ok(result.changes.some((c) => c.path === "age" && c.type === "changed"));
  });

  it("trata JSON equivalentes como iguais após formatar", () => {
    const result = compareInputs('{"a":1}', '{\n  "a": 1\n}');
    assert.equal(result.kind, "json");
    assert.equal(result.git.identical, true);
    assert.equal(result.changes.length, 0);
  });

  it("cai para texto quando os lados não são a mesma estrutura", () => {
    const result = compareInputs("hello\nworld", "hello\nthere");
    assert.equal(result.kind, "text");
    assert.ok(result.changes.length > 0);
    assert.ok(result.git.hunks.length > 0);
  });
});
