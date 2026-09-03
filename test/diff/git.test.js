import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeGitHunks,
  formatDiffSummary,
  hunksToPatch,
  lineInlineDiff,
  rowsToSplitLines,
  buildAlignedRows,
  splitDiffLines,
} from "../../src/diff/git.js";

describe("git diff", () => {
  it("normaliza quebras de linha", () => {
    assert.deepEqual(splitDiffLines("a\r\nb\rc"), ["a", "b", "c"]);
  });

  it("retorna vazio quando os textos são iguais", () => {
    const git = computeGitHunks("same\nline", "same\nline");
    assert.equal(git.identical, true);
    assert.equal(git.hunks.length, 0);
  });

  it("gera hunk unificado com contexto", () => {
    const a = '{\n  "name": "Ana",\n  "age": 20\n}';
    const b = '{\n  "name": "Ana",\n  "age": 21,\n  "city": "SP"\n}';
    const git = computeGitHunks(a, b);

    assert.equal(git.identical, false);
    assert.equal(git.added, 2);
    assert.equal(git.removed, 1);
    assert.equal(git.hunks.length, 1);
    assert.match(git.hunks[0].header, /^@@ -/);

    const kinds = git.hunks[0].rows.map((row) => row.kind);
    assert.ok(kinds.includes("removed"));
    assert.ok(kinds.includes("added"));
    assert.ok(kinds.includes("equal"));
  });

  it("separa hunks distantes", () => {
    const a = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const b = a.slice();
    b[4] = "changed 5";
    b[24] = "changed 25";
    const git = computeGitHunks(a.join("\n"), b.join("\n"));
    assert.equal(git.hunks.length, 2);
  });

  it("exporta patch no formato unificado", () => {
    const git = computeGitHunks("old", "new");
    const patch = hunksToPatch(git.hunks);
    assert.match(patch, /^--- A\n\+\+\+ B/m);
    assert.match(patch, /^-old/m);
    assert.match(patch, /^\+new/m);
  });

  it("destaca o trecho interno da linha", () => {
    const inline = lineInlineDiff('  "age": 20', '  "age": 21');
    assert.match(inline.delHtml, /diff-inline-del/);
    assert.match(inline.insHtml, /diff-inline-ins/);
  });

  it("alinha removido e adicionado lado a lado", () => {
    const lines = rowsToSplitLines([
      { kind: "equal", text: "keep", lineA: 1, lineB: 1 },
      { kind: "removed", text: "old", lineA: 2, html: "<del>old</del>" },
      { kind: "added", text: "new", lineB: 2, html: "<ins>new</ins>" },
      { kind: "removed", text: "gone", lineA: 3 },
      { kind: "equal", text: "end", lineA: 4, lineB: 3 },
    ]);

    assert.equal(lines.length, 4);
    assert.equal(lines[0].left.kind, "equal");
    assert.equal(lines[0].right.kind, "equal");
    assert.equal(lines[1].left.kind, "removed");
    assert.equal(lines[1].right.kind, "added");
    assert.equal(lines[1].left.html, "<del>old</del>");
    assert.equal(lines[1].right.html, "<ins>new</ins>");
    assert.equal(lines[2].left.kind, "removed");
    assert.equal(lines[2].right.kind, "empty");
    assert.equal(lines[3].left.text, "end");
  });

  it("alinha o documento inteiro, inclusive o prefixo igual", () => {
    const rows = buildAlignedRows("keep\nold\nend", "keep\nnew\nend");
    assert.equal(rows[0].kind, "equal");
    assert.equal(rows[0].text, "keep");
    assert.equal(rows[1].kind, "removed");
    assert.equal(rows[2].kind, "added");
    assert.equal(rows.at(-1).text, "end");
    assert.equal(rows.at(-1).kind, "equal");
  });

  it("resume estatísticas", () => {
    const git = { identical: false, added: 2, removed: 1 };
    const summary = formatDiffSummary(
      git,
      [{ type: "changed" }, { type: "added" }],
      "json",
    );
    assert.match(summary, /\+2/);
    assert.match(summary, /campo\(s\)/);
    assert.match(summary, /JSON/);
  });
});
