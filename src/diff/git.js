import { compactPreview, escapeHtml } from "../core/text.js";
import { buildChange } from "./semantic.js";

export const DIFF_CONTEXT = 3;

export const DIFF_LCS_LIMIT = 400000;

export function splitDiffLines(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function diffLineOps(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : dp[i - 1][j] > dp[i][j - 1]
            ? dp[i - 1][j]
            : dp[i][j - 1];
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "equal", a: a[i - 1], lineA: i, lineB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "added", b: b[j - 1], lineB: j });
      j--;
    } else {
      ops.push({ type: "removed", a: a[i - 1], lineA: i });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

export function computeMidOps(midA, midB, start) {
  if (midA.length * midB.length > DIFF_LCS_LIMIT) {
    const ops = [];
    const pairs = Math.min(midA.length, midB.length);
    for (let i = 0; i < pairs; i++) {
      if (midA[i] === midB[i]) {
        ops.push({
          type: "equal",
          a: midA[i],
          b: midB[i],
          lineA: start + i + 1,
          lineB: start + i + 1,
        });
      } else {
        ops.push({ type: "removed", a: midA[i], lineA: start + i + 1 });
        ops.push({ type: "added", b: midB[i], lineB: start + i + 1 });
      }
    }
    for (let i = pairs; i < midA.length; i++) {
      ops.push({ type: "removed", a: midA[i], lineA: start + i + 1 });
    }
    for (let i = pairs; i < midB.length; i++) {
      ops.push({ type: "added", b: midB[i], lineB: start + i + 1 });
    }
    return ops;
  }

  return diffLineOps(midA, midB).map((op) => {
    const next = { ...op };
    if (next.lineA != null) next.lineA += start;
    if (next.lineB != null) next.lineB += start;
    return next;
  });
}

export function hunkRange(start, count) {
  if (count === 0) return `${start},0`;
  return `${start},${count}`;
}

export function lineInlineDiff(a, b) {
  if (a === b || a.length > 2000 || b.length > 2000) return null;

  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const prefix = a.slice(0, start);
  const suffix = a.slice(endA + 1);
  const removed = a.slice(start, endA + 1);
  const added = b.slice(start, endB + 1);
  if (!removed && !added) return null;

  return {
    delHtml:
      escapeHtml(prefix) +
      (removed ? `<span class="diff-inline-del">${escapeHtml(removed)}</span>` : "") +
      escapeHtml(suffix),
    insHtml:
      escapeHtml(prefix) +
      (added ? `<span class="diff-inline-ins">${escapeHtml(added)}</span>` : "") +
      escapeHtml(suffix),
  };
}

export function applyInlineHighlights(rows) {
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "removed") {
      i++;
      continue;
    }

    let remEnd = i;
    while (remEnd < rows.length && rows[remEnd].kind === "removed") remEnd++;
    let addEnd = remEnd;
    while (addEnd < rows.length && rows[addEnd].kind === "added") addEnd++;

    const pairs = Math.min(remEnd - i, addEnd - remEnd);
    for (let p = 0; p < pairs; p++) {
      const inline = lineInlineDiff(rows[i + p].text, rows[remEnd + p].text);
      if (inline) {
        rows[i + p].html = inline.delHtml;
        rows[remEnd + p].html = inline.insHtml;
      }
    }
    i = addEnd;
  }
}

export function opsToHunk(ops) {
  const rows = [];
  let oldStart = 0;
  let newStart = 0;
  let oldCount = 0;
  let newCount = 0;
  let added = 0;
  let removed = 0;
  let oldSet = false;
  let newSet = false;

  for (const op of ops) {
    if (op.type === "equal") {
      if (!oldSet && op.lineA != null) {
        oldStart = op.lineA;
        oldSet = true;
      }
      if (!newSet && op.lineB != null) {
        newStart = op.lineB;
        newSet = true;
      }
      oldCount++;
      newCount++;
      rows.push({ kind: "equal", text: op.a, lineA: op.lineA, lineB: op.lineB });
    } else if (op.type === "removed") {
      if (!oldSet && op.lineA != null) {
        oldStart = op.lineA;
        oldSet = true;
      }
      oldCount++;
      removed++;
      rows.push({ kind: "removed", text: op.a, lineA: op.lineA, lineB: null });
    } else {
      if (!newSet && op.lineB != null) {
        newStart = op.lineB;
        newSet = true;
      }
      newCount++;
      added++;
      rows.push({ kind: "added", text: op.b, lineA: null, lineB: op.lineB });
    }
  }

  applyInlineHighlights(rows);

  const firstChange = rows.find((row) => row.kind !== "equal");
  const hint = firstChange
    ? ` ${compactPreview(firstChange.text.trim() || firstChange.text, 48)}`
    : "";

  return {
    header: `@@ -${hunkRange(oldStart, oldCount)} +${hunkRange(newStart, newCount)} @@${hint}`,
    rows,
    added,
    removed,
  };
}

export function computeGitHunks(textA, textB, context = DIFF_CONTEXT) {
  const linesA = splitDiffLines(textA);
  const linesB = splitDiffLines(textB);

  if (textA === textB) {
    return { identical: true, hunks: [], added: 0, removed: 0 };
  }

  let start = 0;
  while (
    start < linesA.length &&
    start < linesB.length &&
    linesA[start] === linesB[start]
  ) {
    start++;
  }

  let endA = linesA.length - 1;
  let endB = linesB.length - 1;
  while (endA >= start && endB >= start && linesA[endA] === linesB[endB]) {
    endA--;
    endB--;
  }

  if (start > endA && start > endB) {
    return { identical: true, hunks: [], added: 0, removed: 0 };
  }

  const midA = linesA.slice(start, endA + 1);
  const midB = linesB.slice(start, endB + 1);
  const midOps = computeMidOps(midA, midB, start);
  const prefixLen = start;
  const suffixStartA = endA + 1;
  const suffixStartB = endB + 1;

  const islands = [];
  for (let i = 0; i < midOps.length; ) {
    if (midOps[i].type === "equal") {
      i++;
      continue;
    }
    const islandStart = i;
    while (i < midOps.length && midOps[i].type !== "equal") i++;
    if (
      islands.length &&
      islandStart - islands[islands.length - 1].end <= context * 2
    ) {
      islands[islands.length - 1].end = i;
    } else {
      islands.push({ start: islandStart, end: i });
    }
  }

  const hunks = islands.map((island) => {
    const ops = [];

    let beforeEquals = 0;
    for (let i = island.start - 1; i >= 0 && midOps[i].type === "equal"; i--) {
      beforeEquals++;
    }
    const prefixNeed = Math.max(0, context - beforeEquals);
    const prefixTake = Math.min(prefixNeed, prefixLen);
    for (let i = prefixLen - prefixTake; i < prefixLen; i++) {
      ops.push({
        type: "equal",
        a: linesA[i],
        b: linesB[i],
        lineA: i + 1,
        lineB: i + 1,
      });
    }

    let afterEquals = 0;
    for (
      let i = island.end;
      i < midOps.length && midOps[i].type === "equal";
      i++
    ) {
      afterEquals++;
    }

    const midFrom = island.start - Math.min(beforeEquals, context);
    const midTo = island.end + Math.min(afterEquals, context);
    ops.push(...midOps.slice(midFrom, midTo));

    if (midTo >= midOps.length) {
      const suffixTake = Math.min(
        Math.max(0, context - afterEquals),
        linesA.length - suffixStartA,
      );
      for (let k = 0; k < suffixTake; k++) {
        ops.push({
          type: "equal",
          a: linesA[suffixStartA + k],
          b: linesB[suffixStartB + k],
          lineA: suffixStartA + k + 1,
          lineB: suffixStartB + k + 1,
        });
      }
    }

    return opsToHunk(ops);
  });

  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    added += hunk.added;
    removed += hunk.removed;
  }

  return { identical: false, hunks, added, removed };
}

export function buildAlignedRows(textA, textB) {
  const linesA = splitDiffLines(textA);
  const linesB = splitDiffLines(textB);
  const rows = [];

  if (textA === textB) {
    for (let i = 0; i < linesA.length; i++) {
      rows.push({
        kind: "equal",
        text: linesA[i],
        lineA: i + 1,
        lineB: i + 1,
      });
    }
    return rows;
  }

  let start = 0;
  while (
    start < linesA.length &&
    start < linesB.length &&
    linesA[start] === linesB[start]
  ) {
    rows.push({
      kind: "equal",
      text: linesA[start],
      lineA: start + 1,
      lineB: start + 1,
    });
    start++;
  }

  let endA = linesA.length - 1;
  let endB = linesB.length - 1;
  while (endA >= start && endB >= start && linesA[endA] === linesB[endB]) {
    endA--;
    endB--;
  }

  if (start <= endA || start <= endB) {
    const midOps = computeMidOps(
      linesA.slice(start, endA + 1),
      linesB.slice(start, endB + 1),
      start,
    );
    for (const op of midOps) {
      if (op.type === "equal") {
        rows.push({
          kind: "equal",
          text: op.a,
          lineA: op.lineA,
          lineB: op.lineB,
        });
      } else if (op.type === "removed") {
        rows.push({ kind: "removed", text: op.a, lineA: op.lineA, lineB: null });
      } else {
        rows.push({ kind: "added", text: op.b, lineA: null, lineB: op.lineB });
      }
    }
  }

  const suffixA = endA + 1;
  const suffixB = endB + 1;
  for (let k = 0; k < linesA.length - suffixA; k++) {
    rows.push({
      kind: "equal",
      text: linesA[suffixA + k],
      lineA: suffixA + k + 1,
      lineB: suffixB + k + 1,
    });
  }

  applyInlineHighlights(rows);
  return rows;
}

export function changesFromHunks(hunks) {
  const changes = [];

  const flush = (removed, added) => {
    const pairs = Math.min(removed.length, added.length);
    for (let i = 0; i < pairs; i++) {
      changes.push(
        buildChange(
          "changed",
          `linha ${removed[i].lineA} → ${added[i].lineB}`,
          removed[i].text,
          added[i].text,
        ),
      );
    }
    for (let i = pairs; i < removed.length; i++) {
      changes.push(
        buildChange("removed", `linha ${removed[i].lineA}`, removed[i].text, undefined),
      );
    }
    for (let i = pairs; i < added.length; i++) {
      changes.push(
        buildChange("added", `linha ${added[i].lineB}`, undefined, added[i].text),
      );
    }
  };

  for (const hunk of hunks) {
    let removed = [];
    let added = [];
    for (const row of hunk.rows) {
      if (row.kind === "equal") {
        flush(removed, added);
        removed = [];
        added = [];
      } else if (row.kind === "removed") {
        removed.push(row);
      } else {
        added.push(row);
      }
    }
    flush(removed, added);
  }

  return changes;
}

export function rowsToSplitLines(rows) {
  const lines = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i];
    if (row.kind === "equal") {
      lines.push({
        left: { kind: "equal", line: row.lineA, text: row.text, html: null },
        right: { kind: "equal", line: row.lineB, text: row.text, html: null },
      });
      i++;
      continue;
    }

    let remEnd = i;
    while (remEnd < rows.length && rows[remEnd].kind === "removed") remEnd++;
    let addEnd = remEnd;
    while (addEnd < rows.length && rows[addEnd].kind === "added") addEnd++;

    const removed = rows.slice(i, remEnd);
    const added = rows.slice(remEnd, addEnd);
    const count = Math.max(removed.length, added.length);

    for (let p = 0; p < count; p++) {
      const left = removed[p];
      const right = added[p];
      lines.push({
        left: left
          ? { kind: "removed", line: left.lineA, text: left.text, html: left.html || null }
          : { kind: "empty", line: null, text: "", html: null },
        right: right
          ? { kind: "added", line: right.lineB, text: right.text, html: right.html || null }
          : { kind: "empty", line: null, text: "", html: null },
      });
    }

    i = addEnd;
  }

  return lines;
}

export function hunksToPatch(hunks) {
  const lines = ["--- A", "+++ B"];
  for (const hunk of hunks) {
    lines.push(hunk.header);
    for (const row of hunk.rows) {
      const sign = row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " ";
      lines.push(`${sign}${row.text}`);
    }
  }
  return lines.join("\n");
}

export function formatDiffSummary(git, changes, kind) {
  if (git.identical && changes.length === 0) {
    return "Nenhuma diferença encontrada.";
  }

  const parts = [];
  if (!git.identical) {
    parts.push(`+${git.added}  −${git.removed}`);
  } else {
    parts.push("Linhas iguais");
  }

  if (kind !== "text" && changes.length) {
    const added = changes.filter((c) => c.type === "added").length;
    const removed = changes.filter((c) => c.type === "removed").length;
    const changed = changes.filter((c) => c.type === "changed").length;
    parts.push(`${changes.length} campo(s): +${added}  −${removed}  ~${changed}`);
  }

  const kindHint = kind === "text" ? "texto" : kind === "xml" ? "XML" : "JSON";
  parts.push(kindHint);
  return parts.join(" · ");
}
