import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectDiff,
  pathJoin,
  typeLabel,
  valueType,
} from "../../src/diff/semantic.js";

describe("semantic diff", () => {
  it("monta caminhos", () => {
    assert.equal(pathJoin("", "user"), "user");
    assert.equal(pathJoin("user", "name"), "user.name");
    assert.equal(pathJoin("tags", 0), "tags[0]");
  });

  it("classifica tipos", () => {
    assert.equal(valueType(null), "null");
    assert.equal(valueType([1]), "array");
    assert.equal(typeLabel([1, 2]), "array[2]");
    assert.equal(typeLabel({ a: 1 }), "object{1}");
    assert.equal(typeLabel("ab"), "string(2)");
  });

  it("detecta campo adicionado, removido e alterado", () => {
    const changes = collectDiff(
      { name: "Ana", age: 20, extra: true },
      { name: "Ana", age: 21, city: "SP" },
    );

    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]));
    assert.equal(byPath.age.type, "changed");
    assert.equal(byPath.age.oldValue, 20);
    assert.equal(byPath.age.newValue, 21);
    assert.equal(byPath.extra.type, "removed");
    assert.equal(byPath.city.type, "added");
  });

  it("compara arrays por índice", () => {
    const changes = collectDiff([1, 2], [1, 3, 4]);
    assert.equal(changes.some((c) => c.path === "[1]" && c.type === "changed"), true);
    assert.equal(changes.some((c) => c.path === "[2]" && c.type === "added"), true);
  });

  it("não aponta diferença em valores iguais", () => {
    assert.deepEqual(collectDiff({ a: 1 }, { a: 1 }), []);
  });
});
