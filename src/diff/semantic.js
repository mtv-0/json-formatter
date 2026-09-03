import { escapeHtml } from "../core/text.js";

export function pathJoin(base, key) {
  if (base === "") {
    return typeof key === "number" ? `[${key}]` : key;
  }
  return typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`;
}

export function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function typeLabel(value) {
  const t = valueType(value);
  if (t === "array") return `array[${value.length}]`;
  if (t === "object") return `object{${Object.keys(value).length}}`;
  if (t === "string") return `string(${value.length})`;
  return t;
}

export function formatValueForDiff(value, max = 280) {
  if (value === undefined) return "undefined";
  let text;
  try {
    text = JSON.stringify(value, null, value !== null && typeof value === "object" ? 2 : undefined);
  } catch {
    text = String(value);
  }
  if (text.length > max) {
    return `${text.slice(0, max)}…`;
  }
  return text;
}

export function describeStringChange(a, b) {
  if (a === b) return "Strings iguais";
  const parts = [`String alterada (${a.length} → ${b.length} chars)`];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const removed = a.slice(start, endA + 1);
  const added = b.slice(start, endB + 1);

  if (removed || added) {
    parts.push(`trecho na posição ${start}`);
    if (removed) parts.push(`removeu ${JSON.stringify(removed)}`);
    if (added) parts.push(`inseriu ${JSON.stringify(added)}`);
  }

  return parts.join(" · ");
}

export function buildStringInlineDiff(a, b) {
  if (a === b || a.length > 400 || b.length > 400) return null;

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const prefix = escapeHtml(a.slice(0, start));
  const suffix = escapeHtml(a.slice(endA + 1));
  const removed = escapeHtml(a.slice(start, endA + 1));
  const added = escapeHtml(b.slice(start, endB + 1));

  if (!removed && !added) return null;

  return (
    `<span class="diff-inline-same">${prefix}</span>` +
    (removed ? `<span class="diff-inline-del">${removed}</span>` : "") +
    (added ? `<span class="diff-inline-ins">${added}</span>` : "") +
    `<span class="diff-inline-same">${suffix}</span>`
  );
}

export function describeChange(change) {
  const details = [];

  if (change.type === "added") {
    details.push({
      label: "O que aconteceu",
      text: `Campo adicionado em B (${typeLabel(change.newValue)})`,
    });
    details.push({
      label: "Valor em B",
      text: formatValueForDiff(change.newValue),
      tone: "added",
    });
    return details;
  }

  if (change.type === "removed") {
    details.push({
      label: "O que aconteceu",
      text: `Campo removido em B (existia em A como ${typeLabel(change.oldValue)})`,
    });
    details.push({
      label: "Valor em A",
      text: formatValueForDiff(change.oldValue),
      tone: "removed",
    });
    return details;
  }

  const { oldValue: a, newValue: b, oldType, newType } = change;

  if (oldType !== newType) {
    details.push({
      label: "O que aconteceu",
      text: `Tipo alterado: ${typeLabel(a)} → ${typeLabel(b)}`,
    });
  } else if (oldType === "string") {
    details.push({
      label: "O que aconteceu",
      text: describeStringChange(a, b),
    });
  } else if (oldType === "number") {
    const delta = b - a;
    const sign = delta > 0 ? "+" : "";
    details.push({
      label: "O que aconteceu",
      text: `Número alterado (${sign}${delta})`,
    });
  } else if (oldType === "boolean") {
    details.push({
      label: "O que aconteceu",
      text: `Booleano alterado: ${a} → ${b}`,
    });
  } else {
    details.push({
      label: "O que aconteceu",
      text: `Valor ${oldType} alterado`,
    });
  }

  details.push({
    label: "Antes (A)",
    text: formatValueForDiff(a),
    tone: "removed",
  });
  details.push({
    label: "Depois (B)",
    text: formatValueForDiff(b),
    tone: "added",
  });

  if (oldType === "string" && newType === "string") {
    const inline = buildStringInlineDiff(a, b);
    if (inline) {
      details.push({
        label: "Diferença na string",
        html: inline,
      });
    }
  }

  return details;
}

export function buildChange(type, path, oldValue, newValue) {
  const change = {
    type,
    path,
    oldValue,
    newValue,
    oldType: oldValue === undefined ? null : valueType(oldValue),
    newType: newValue === undefined ? null : valueType(newValue),
  };
  change.details = describeChange(change);
  return change;
}

export function collectDiff(a, b, path = "", out = []) {
  if (Object.is(a, b)) return out;

  const aObj = a !== null && typeof a === "object";
  const bObj = b !== null && typeof b === "object";

  if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) {
    out.push(buildChange("changed", path || "$", a, b));
    return out;
  }

  if (Array.isArray(a)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const next = pathJoin(path, i);
      if (i >= a.length) {
        out.push(buildChange("added", next, undefined, b[i]));
      } else if (i >= b.length) {
        out.push(buildChange("removed", next, a[i], undefined));
      } else {
        collectDiff(a[i], b[i], next, out);
      }
    }
    return out;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const next = pathJoin(path, key);
    const hasA = Object.prototype.hasOwnProperty.call(a, key);
    const hasB = Object.prototype.hasOwnProperty.call(b, key);
    if (!hasA) {
      out.push(buildChange("added", next, undefined, b[key]));
    } else if (!hasB) {
      out.push(buildChange("removed", next, a[key], undefined));
    } else {
      collectDiff(a[key], b[key], next, out);
    }
  }
  return out;
}
