import { stripBom } from "../core/text.js";
import { serializeXml } from "../core/xml.js";
import { tryParseStructured } from "../core/structured.js";
import { collectDiff } from "./semantic.js";
import { changesFromHunks, computeGitHunks } from "./git.js";

export function prettyForGit(parsed, originalText) {
  if (parsed.kind === "xml" && parsed.doc) {
    return serializeXml(parsed.doc, { pretty: true, originalText });
  }
  try {
    return JSON.stringify(parsed.value, null, 2);
  } catch {
    return stripBom(originalText);
  }
}

export function compareInputs(textA, textB) {
  const a = tryParseStructured(textA);
  const b = tryParseStructured(textB);
  const structured =
    a.kind !== "text" &&
    b.kind !== "text" &&
    a.kind === b.kind;

  let kind;
  let gitTextA;
  let gitTextB;
  let changes;

  if (structured) {
    kind = a.kind;
    gitTextA = prettyForGit(a, textA);
    gitTextB = prettyForGit(b, textB);
    changes = collectDiff(a.value, b.value);
  } else {
    kind = "text";
    gitTextA = stripBom(textA);
    gitTextB = stripBom(textB);
  }

  const git = computeGitHunks(gitTextA, gitTextB);
  if (!structured) {
    changes = changesFromHunks(git.hunks);
  }

  return { kind, git, changes, textA: gitTextA, textB: gitTextB };
}
