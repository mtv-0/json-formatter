const container = document.querySelector(".container");
const inputArea = document.querySelector(".large-area--input");
const inputAreaB = document.querySelector(".large-area--input-b");
const inputLabelA = document.querySelector(".input-label--a");
const inputLabelB = document.querySelector(".input-label--b");
const outputArea = document.querySelector(".large-area--output");
const formatButton = document.querySelector(".controls__button--format");
const minifyButton = document.querySelector(".controls__button--minify");
const treeButton = document.querySelector(".controls__button--tree");
const diffButton = document.querySelector(".controls__button--diff");
const historyButton = document.querySelector(".controls__button--history");
const clearButton = document.querySelector(".controls__button--clear");
const copyButton = document.querySelector(".copy-button");
const helpFab = document.querySelector(".help-fab");
const helpModal = document.querySelector(".modal--help");
const historyModal = document.querySelector(".modal--history");
const historyList = document.querySelector(".history-list");
const historyEmpty = document.querySelector(".history-empty");
const historyClearAll = document.querySelector(".history-clear-all");

/** Texto pronto para copiar */
let lastCopyText = "";
let toastEl = null;
let toastTimer = null;
let copyResetTimer = null;
let diffMode = false;

const HISTORY_KEY = "json-formatter-history";
const HISTORY_MAX = 25;

const TOKEN_RE =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

const OUTPUT_MODE_CLASSES = ["is-error", "is-minified", "is-tree", "is-diff"];

function resetOutputMode(...modes) {
  outputArea.classList.remove(...OUTPUT_MODE_CLASSES);
  for (const mode of modes) {
    outputArea.classList.add(mode);
  }
}

function isMod(e) {
  return e.ctrlKey || e.metaKey;
}

/* =========================
   Parse inteligente
========================= */
function smartParseJson(input) {
  let text = input.trim();
  if (!text) throw new SyntaxError("Entrada vazia");

  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);
  }

  const json = JSON.parse(text);
  deepParseNestedJson(json);
  return json;
}

function deepParseNestedJson(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === "string") {
        const parsed = tryParseJsonString(item);
        if (parsed !== undefined) {
          value[i] = parsed;
          deepParseNestedJson(parsed);
        }
      } else if (item && typeof item === "object") {
        deepParseNestedJson(item);
      }
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item === "string") {
      const parsed = tryParseJsonString(item);
      if (parsed !== undefined) {
        value[key] = parsed;
        deepParseNestedJson(parsed);
      }
    } else if (item && typeof item === "object") {
      deepParseNestedJson(item);
    }
  }
}

function tryParseJsonString(str) {
  const trimmed = str.trim();
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightLine(line) {
  const escaped = escapeHtml(line);
  return escaped
    .replace(TOKEN_RE, (match) => {
      let cls = "number";
      if (match.startsWith('"')) cls = /:$/.test(match) ? "key" : "string";
      else if (/true|false/.test(match)) cls = "boolean";
      else if (/null/.test(match)) cls = "null";
      return `<span class="${cls}">${match}</span>`;
    })
    .replace(/[{}[\]]/g, (m) => `<span class="brace">${m}</span>`);
}

function compactPreview(text, max = 80) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/* =========================
   Formatação com highlight + collapse
========================= */
function formatJSONWithHighlight(obj, container) {
  resetOutputMode();
  container.replaceChildren();

  const jsonText = JSON.stringify(obj, null, 2);
  lastCopyText = jsonText;
  showCopyButton();

  const lines = jsonText.split("\n");
  const fragment = document.createDocumentFragment();
  const allBraces = [];
  const lineWrappers = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const indentCount = (line.match(/^(\s*)/) || [""])[0].length / 2;
    const trimmed = line.trim();
    const opensBlock = /[{[]\s*$/.test(trimmed);

    const wrapper = document.createElement("div");
    wrapper.className = "line-wrapper";
    wrapper.dataset.indent = String(indentCount);
    wrapper.dataset.index = String(idx);
    if (opensBlock) {
      wrapper.classList.add("block-opener");
      wrapper.dataset.collapsed = "false";
    }

    const foldToggle = document.createElement("span");
    foldToggle.className = "fold-toggle";
    foldToggle.textContent = opensBlock ? "▼" : "";
    foldToggle.setAttribute("aria-hidden", "true");

    const lineNumber = document.createElement("span");
    lineNumber.className = "line-number";
    lineNumber.textContent = String(idx + 1);

    const lineContent = document.createElement("div");
    lineContent.className = "line";

    const indentWrapper = document.createElement("div");
    indentWrapper.className = "indent-lines";
    for (let i = 0; i < indentCount; i++) {
      const il = document.createElement("div");
      il.className = "indent-line";
      indentWrapper.appendChild(il);
    }

    const content = document.createElement("span");
    content.className = "content";
    content.innerHTML = highlightLine(line);

    lineContent.appendChild(indentWrapper);
    lineContent.appendChild(content);
    wrapper.appendChild(foldToggle);
    wrapper.appendChild(lineNumber);
    wrapper.appendChild(lineContent);
    fragment.appendChild(wrapper);

    content.querySelectorAll(".brace").forEach((b) => allBraces.push(b));
    lineWrappers.push(wrapper);
  }

  container.appendChild(fragment);
  linkMatchingBraces(allBraces);
  bindCollapse(lineWrappers, lines);
}

function linkMatchingBraces(allBraces) {
  const stack = [];
  allBraces.forEach((brace, i) => {
    const ch = brace.textContent;
    if (ch === "{" || ch === "[") {
      stack.push({ brace, index: i });
    } else {
      const opener = stack.pop();
      if (opener) {
        brace.dataset.match = String(opener.index);
        opener.brace.dataset.match = String(i);
      }
    }
  });
}

outputArea.addEventListener("click", (e) => {
  const brace = e.target.closest(".brace");
  if (!brace || !outputArea.contains(brace)) return;

  outputArea.querySelectorAll(".brace-active").forEach((b) => {
    b.classList.remove("brace-active");
  });

  const match = brace.dataset.match;
  if (match == null) return;

  brace.classList.add("brace-active");
  const braces = outputArea.querySelectorAll(".brace");
  const pair = braces[Number(match)];
  if (pair) pair.classList.add("brace-active");
});

function bindCollapse(lineWrappers, lines) {
  for (const line of lineWrappers) {
    if (!line.classList.contains("block-opener")) continue;

    const toggle = line.querySelector(".fold-toggle");
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCollapse(line, lineWrappers, lines);
    });
  }
}

function toggleCollapse(line, lineWrappers, lines) {
  const isCollapsed = line.dataset.collapsed === "true";
  const newCollapsed = !isCollapsed;
  line.dataset.collapsed = String(newCollapsed);

  const toggle = line.querySelector(".fold-toggle");
  toggle.textContent = newCollapsed ? "▶" : "▼";

  const baseIndent = Number(line.dataset.indent);
  const startIndex = Number(line.dataset.index);

  let dotsLine = line.nextElementSibling;
  if (dotsLine && !dotsLine.classList.contains("dots-line")) {
    dotsLine = null;
  }

  if (newCollapsed && !dotsLine) {
    const lineText = lines[startIndex].trim();
    if (lineText.endsWith("[")) {
      let itemCount = 0;
      for (let i = startIndex + 1; i < lineWrappers.length; i++) {
        const next = lineWrappers[i];
        const nextIndent = Number(next.dataset.indent);
        if (nextIndent <= baseIndent) break;
        if (nextIndent === baseIndent + 1) {
          const nextLine = lines[i].trim();
          if (!/^[\]}],?$/.test(nextLine)) itemCount++;
        }
      }

      dotsLine = document.createElement("div");
      dotsLine.className = "line-wrapper dots-line";
      dotsLine.innerHTML = `
        <span class="fold-toggle"></span>
        <span class="line-number"></span>
        <div class="line">
          <span class="content dots">... [${itemCount} ${itemCount === 1 ? "item" : "itens"}]</span>
        </div>
      `;
      line.after(dotsLine);
    }
  } else if (!newCollapsed && dotsLine) {
    dotsLine.remove();
  }

  for (let i = startIndex + 1; i < lineWrappers.length; i++) {
    const next = lineWrappers[i];
    const nextIndent = Number(next.dataset.indent);
    if (nextIndent <= baseIndent) break;

    if (newCollapsed) {
      next.style.display = "none";
      const nextDots = next.nextElementSibling;
      if (nextDots?.classList.contains("dots-line")) {
        nextDots.style.display = "none";
      }
      continue;
    }

    let shouldShow = true;
    let currentIndent = nextIndent;

    for (let j = i - 1; j > startIndex; j--) {
      const potentialAncestor = lineWrappers[j];
      const ancestorIndent = Number(potentialAncestor.dataset.indent);

      if (ancestorIndent < currentIndent) {
        currentIndent = ancestorIndent;
        if (
          potentialAncestor.classList.contains("block-opener") &&
          potentialAncestor.dataset.collapsed === "true"
        ) {
          shouldShow = false;
          break;
        }
      }
    }

    if (next.classList.contains("dots-line")) {
      const prevElement = next.previousElementSibling;
      if (prevElement?.classList.contains("block-opener")) {
        next.style.display =
          prevElement.dataset.collapsed === "true" && shouldShow ? "" : "none";
      }
    } else {
      next.style.display = shouldShow ? "" : "none";
    }
  }
}

/* =========================
   JSON → árvore
========================= */
function formatValueLabel(value) {
  if (value === null) return { text: "null", cls: "null" };
  if (typeof value === "boolean") return { text: String(value), cls: "boolean" };
  if (typeof value === "number") return { text: String(value), cls: "number" };
  return { text: JSON.stringify(String(value)), cls: "" };
}

function appendTreeNodes(container, value, prefix = "", isLast = true) {
  const fragment = document.createDocumentFragment();

  const walk = (node, currentPrefix, last) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        const itemLast = index === node.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        const line = document.createElement("div");
        line.className = "tree-line";

        const conn = document.createElement("span");
        conn.className = "tree-connector";
        conn.textContent = currentPrefix + connector;

        const key = document.createElement("span");
        key.className = "tree-key";
        key.textContent = `[${index}]`;

        line.appendChild(conn);
        line.appendChild(key);

        if (item !== null && typeof item === "object") {
          const typeHint = document.createElement("span");
          typeHint.className = "tree-connector";
          typeHint.textContent = Array.isArray(item) ? " []" : " {}";
          line.appendChild(typeHint);
          fragment.appendChild(line);
          walk(item, nextPrefix, itemLast);
        } else {
          const sep = document.createElement("span");
          sep.className = "tree-connector";
          sep.textContent = ": ";
          const val = document.createElement("span");
          const formatted = formatValueLabel(item);
          val.className = `tree-value${formatted.cls ? ` ${formatted.cls}` : ""}`;
          val.textContent = formatted.text;
          line.appendChild(sep);
          line.appendChild(val);
          fragment.appendChild(line);
        }
      });
      return;
    }

    if (node !== null && typeof node === "object") {
      const entries = Object.entries(node);
      entries.forEach(([keyName, item], index) => {
        const itemLast = index === entries.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        const line = document.createElement("div");
        line.className = "tree-line";

        const conn = document.createElement("span");
        conn.className = "tree-connector";
        conn.textContent = currentPrefix + connector;

        const key = document.createElement("span");
        key.className = "tree-key";
        key.textContent = keyName;

        line.appendChild(conn);
        line.appendChild(key);

        if (item !== null && typeof item === "object") {
          const typeHint = document.createElement("span");
          typeHint.className = "tree-connector";
          typeHint.textContent = Array.isArray(item) ? " []" : " {}";
          line.appendChild(typeHint);
          fragment.appendChild(line);
          walk(item, nextPrefix, itemLast);
        } else {
          const sep = document.createElement("span");
          sep.className = "tree-connector";
          sep.textContent = ": ";
          const val = document.createElement("span");
          const formatted = formatValueLabel(item);
          val.className = `tree-value${formatted.cls ? ` ${formatted.cls}` : ""}`;
          val.textContent = formatted.text;
          line.appendChild(sep);
          line.appendChild(val);
          fragment.appendChild(line);
        }
      });
    }
  };

  const root = document.createElement("div");
  root.className = "tree-line";
  const rootLabel = document.createElement("span");
  rootLabel.className = "tree-key";
  rootLabel.textContent = Array.isArray(value) ? "[]" : "{}";
  root.appendChild(rootLabel);
  fragment.appendChild(root);

  walk(value, prefix, isLast);
  container.appendChild(fragment);
}

function treeToPlainText(value, prefix = "", isLast = true) {
  const lines = [];

  const walk = (node, currentPrefix, last) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        const itemLast = index === node.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        if (item !== null && typeof item === "object") {
          lines.push(
            `${currentPrefix}${connector}[${index}] ${Array.isArray(item) ? "[]" : "{}"}`,
          );
          walk(item, nextPrefix, itemLast);
        } else {
          lines.push(
            `${currentPrefix}${connector}[${index}]: ${formatValueLabel(item).text}`,
          );
        }
      });
      return;
    }

    if (node !== null && typeof node === "object") {
      const entries = Object.entries(node);
      entries.forEach(([keyName, item], index) => {
        const itemLast = index === entries.length - 1;
        const connector = itemLast ? "└─ " : "├─ ";
        const nextPrefix = currentPrefix + (last ? "   " : "│  ");

        if (item !== null && typeof item === "object") {
          lines.push(
            `${currentPrefix}${connector}${keyName} ${Array.isArray(item) ? "[]" : "{}"}`,
          );
          walk(item, nextPrefix, itemLast);
        } else {
          lines.push(
            `${currentPrefix}${connector}${keyName}: ${formatValueLabel(item).text}`,
          );
        }
      });
    }
  };

  lines.push(Array.isArray(value) ? "[]" : "{}");
  walk(value, prefix, isLast);
  return lines.join("\n");
}

/* =========================
   Diff
========================= */
function pathJoin(base, key) {
  if (base === "") {
    return typeof key === "number" ? `[${key}]` : key;
  }
  return typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function typeLabel(value) {
  const t = valueType(value);
  if (t === "array") return `array[${value.length}]`;
  if (t === "object") return `object{${Object.keys(value).length}}`;
  if (t === "string") return `string(${value.length})`;
  return t;
}

function formatValueForDiff(value, max = 280) {
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

function collectDiff(a, b, path = "", out = []) {
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

function buildChange(type, path, oldValue, newValue) {
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

function describeChange(change) {
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

function describeStringChange(a, b) {
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

function buildStringInlineDiff(a, b) {
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

function renderDiff(changes) {
  resetOutputMode("is-diff");
  outputArea.replaceChildren();

  const fragment = document.createDocumentFragment();
  const summary = document.createElement("div");
  summary.className = "diff-summary";

  if (changes.length === 0) {
    summary.textContent = "Nenhuma diferença encontrada.";
    fragment.appendChild(summary);
    const empty = document.createElement("div");
    empty.className = "diff-empty";
    empty.textContent = "JSON A e JSON B são equivalentes.";
    fragment.appendChild(empty);
    lastCopyText = "Nenhuma diferença encontrada.";
    outputArea.appendChild(fragment);
    showCopyButton();
    return;
  }

  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const changed = changes.filter((c) => c.type === "changed").length;
  summary.textContent = `${changes.length} diferença(s): +${added}  −${removed}  ~${changed}`;
  fragment.appendChild(summary);

  const plainLines = [summary.textContent, ""];

  for (const change of changes) {
    const card = document.createElement("article");
    card.className = `diff-card diff-card--${change.type}`;

    const header = document.createElement("div");
    header.className = "diff-card__header";

    const tag = document.createElement("span");
    tag.className = "diff-tag";
    tag.textContent =
      change.type === "added"
        ? "+ add"
        : change.type === "removed"
          ? "− rem"
          : "~ chg";

    const pathEl = document.createElement("span");
    pathEl.className = "diff-path";
    pathEl.textContent = change.path;

    const typeHint = document.createElement("span");
    typeHint.className = "diff-type-hint";
    if (change.type === "changed") {
      typeHint.textContent = `${typeLabel(change.oldValue)} → ${typeLabel(change.newValue)}`;
    } else if (change.type === "added") {
      typeHint.textContent = typeLabel(change.newValue);
    } else {
      typeHint.textContent = typeLabel(change.oldValue);
    }

    header.appendChild(tag);
    header.appendChild(pathEl);
    header.appendChild(typeHint);
    card.appendChild(header);

    plainLines.push(`${tag.textContent} ${change.path} (${typeHint.textContent})`);

    for (const detail of change.details || []) {
      const block = document.createElement("div");
      block.className = "diff-block";
      if (detail.tone) block.classList.add(`diff-block--${detail.tone}`);

      const label = document.createElement("div");
      label.className = "diff-block__label";
      label.textContent = detail.label;

      const body = document.createElement("div");
      body.className = "diff-block__body";
      if (detail.html) {
        body.innerHTML = detail.html;
      } else {
        body.textContent = detail.text;
      }

      block.appendChild(label);
      block.appendChild(body);
      card.appendChild(block);

      plainLines.push(`  ${detail.label}: ${detail.text || body.textContent}`);
    }

    plainLines.push("");
    fragment.appendChild(card);
  }

  lastCopyText = plainLines.join("\n").trim();
  outputArea.appendChild(fragment);
  showCopyButton();
}

function setDiffMode(enabled) {
  diffMode = enabled;
  container.classList.toggle("is-diff", enabled);
  diffButton.classList.toggle("is-active", enabled);
  inputAreaB.hidden = !enabled;
  inputLabelA.hidden = !enabled;
  inputLabelB.hidden = !enabled;

  formatButton.textContent = enabled ? "Compare" : "Format";

  inputArea.setAttribute(
    "aria-label",
    enabled ? "Entrada JSON A" : "Entrada JSON",
  );
  inputArea.placeholder = enabled
    ? "JSON A..."
    : "Cole seu JSON aqui... (Ctrl+Enter para formatar)";

  if (enabled) {
    inputAreaB.focus();
  }
}

function toggleDiffMode() {
  setDiffMode(!diffMode);
  if (diffMode) {
    showToast("Modo Diff ativo — Compare ou Ctrl+Shift+Enter");
  } else {
    showToast("Modo Diff desativado");
  }
}

/* =========================
   Histórico local
========================= */
const MODE_LABELS = {
  format: "Format",
  minify: "Minify",
  tree: "Tree",
  diff: "Diff",
};

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
}

function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;

  // Entradas antigas (só text/source)
  if (!item.mode) {
    const source = item.source || "format";
    if (source === "diff-a" || source === "diff-b") {
      return {
        ...item,
        mode: "diff",
        text: item.text || "",
        textB: "",
      };
    }
    return {
      ...item,
      mode: ["format", "minify", "tree"].includes(source) ? source : "format",
      text: item.text || "",
      textB: "",
    };
  }

  return {
    ...item,
    text: item.text || "",
    textB: item.textB || "",
  };
}

function pushHistoryEntry({ mode, text, textB = "" }) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const trimmedB = textB.trim();
  const items = getHistory().filter((raw) => {
    const item = normalizeHistoryItem(raw);
    if (!item) return false;
    if (mode === "diff") {
      return !(
        item.mode === "diff" &&
        item.text === trimmed &&
        item.textB === trimmedB
      );
    }
    return !(item.mode === mode && item.text === trimmed && !item.textB);
  });

  const label = MODE_LABELS[mode] || mode;
  const preview =
    mode === "diff"
      ? `${label} · ${compactPreview(trimmed, 36)} ↔ ${compactPreview(trimmedB, 36)}`
      : `${label} · ${compactPreview(trimmed)}`;

  items.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    text: trimmed,
    textB: mode === "diff" ? trimmedB : "",
    preview,
    ts: Date.now(),
  });
  setHistory(items);
}

function formatHistoryDate(ts) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function restoreHistoryItem(raw) {
  const item = normalizeHistoryItem(raw);
  if (!item) return;

  const mode = item.mode || "format";
  setDiffMode(mode === "diff");
  inputArea.value = item.text;
  inputAreaB.value = mode === "diff" ? item.textB : "";

  try {
    if (mode === "diff") {
      if (!item.textB.trim()) {
        showToast("Diff restaurado — complete o JSON B", false, 2500);
      } else {
        const a = smartParseJson(item.text);
        const b = smartParseJson(item.textB);
        renderDiff(collectDiff(a, b));
        showToast("Diff restaurado");
      }
    } else if (mode === "minify") {
      renderMinified(smartParseJson(item.text));
      showToast("Minify restaurado");
    } else if (mode === "tree") {
      renderTree(smartParseJson(item.text));
      showToast("Tree restaurado");
    } else {
      formatJSONWithHighlight(smartParseJson(item.text), outputArea);
      showToast("Format restaurado");
    }
  } catch (e) {
    showError(`Não foi possível reprocessar:\n${e.message}`);
    showToast("Entrada restaurada (saída com erro)", true);
  }

  historyModal.close();
  inputArea.focus();
}

function renderHistoryList() {
  const items = getHistory()
    .map(normalizeHistoryItem)
    .filter(Boolean);
  historyList.replaceChildren();
  historyEmpty.hidden = items.length > 0;

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "history-item";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "history-item__main";
    main.title = "Restaurar no editor";

    const preview = document.createElement("span");
    preview.className = "history-item__preview";
    preview.textContent = item.preview || compactPreview(item.text);

    const meta = document.createElement("span");
    meta.className = "history-item__meta";
    const modeLabel = MODE_LABELS[item.mode] || item.mode || "Format";
    meta.textContent = `${modeLabel} · ${formatHistoryDate(item.ts)}`;

    main.appendChild(preview);
    main.appendChild(meta);
    main.addEventListener("click", () => restoreHistoryItem(item));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "history-item__delete";
    del.setAttribute("aria-label", "Remover item");
    del.textContent = "×";
    del.addEventListener("click", () => {
      setHistory(getHistory().filter((h) => h.id !== item.id));
      renderHistoryList();
    });

    li.appendChild(main);
    li.appendChild(del);
    historyList.appendChild(li);
  }
}

function openHistory() {
  renderHistoryList();
  historyModal.showModal();
}

/* =========================
   Saída / erros / copiar
========================= */
function showCopyButton() {
  copyButton.hidden = false;
}

function hideCopyButton() {
  copyButton.hidden = true;
  lastCopyText = "";
}

function showError(message) {
  hideCopyButton();
  resetOutputMode("is-error");
  outputArea.replaceChildren();
  outputArea.textContent = message;
}

function renderMinified(json) {
  const text = JSON.stringify(json);
  lastCopyText = text;
  resetOutputMode("is-minified");
  outputArea.replaceChildren();
  outputArea.textContent = text;
  showCopyButton();
}

function renderTree(json) {
  lastCopyText = treeToPlainText(json);
  resetOutputMode("is-tree");
  outputArea.replaceChildren();
  appendTreeNodes(outputArea, json);
  showCopyButton();
}

async function copyOutput() {
  if (!lastCopyText) {
    showToast("Nada para copiar", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(lastCopyText);
    copyButton.textContent = "Copiado!";
    copyButton.classList.add("is-copied");
    showToast("Copiado para a área de transferência!");

    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyButton.textContent = "Copiar";
      copyButton.classList.remove("is-copied");
    }, 1500);
  } catch {
    showToast("Não foi possível copiar", true);
  }
}

function clearAll() {
  inputArea.value = "";
  inputAreaB.value = "";
  resetOutputMode();
  outputArea.replaceChildren();
  hideCopyButton();
  inputArea.focus();
}

/* =========================
   Toast
========================= */
function showToast(message, isError = false, duration = 2000) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast-message";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.classList.toggle("is-error", isError);
  toastEl.classList.remove("show");
  void toastEl.offsetWidth;
  toastEl.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, duration);
}

/* =========================
   Ações
========================= */
function runFormat() {
  if (diffMode) {
    runDiff();
    return;
  }

  try {
    const json = smartParseJson(inputArea.value);
    formatJSONWithHighlight(json, outputArea);
    pushHistoryEntry({ mode: "format", text: inputArea.value });
  } catch (e) {
    showError(`JSON Inválido!\n${e.message}`);
  }
}

function runMinify() {
  try {
    const json = smartParseJson(inputArea.value);
    renderMinified(json);
    pushHistoryEntry({ mode: "minify", text: inputArea.value });
  } catch (e) {
    showError(`JSON Inválido!\n${e.message}`);
  }
}

function runTree() {
  try {
    const json = smartParseJson(inputArea.value);
    renderTree(json);
    pushHistoryEntry({ mode: "tree", text: inputArea.value });
  } catch (e) {
    showError(`JSON Inválido!\n${e.message}`);
  }
}

function runDiff() {
  if (!diffMode) {
    setDiffMode(true);
    showToast("Modo Diff ativo — cole JSON A e B");
    return;
  }

  try {
    const a = smartParseJson(inputArea.value);
    const b = smartParseJson(inputAreaB.value);
    const changes = collectDiff(a, b);
    renderDiff(changes);
    pushHistoryEntry({
      mode: "diff",
      text: inputArea.value,
      textB: inputAreaB.value,
    });
  } catch (e) {
    showError(`JSON Inválido!\n${e.message}`);
  }
}

function openHelp() {
  helpModal.showModal();
}

function closeTopModal() {
  if (helpModal.open) helpModal.close();
  else if (historyModal.open) historyModal.close();
}

/* =========================
   Eventos
========================= */
formatButton.addEventListener("click", runFormat);
minifyButton.addEventListener("click", runMinify);
treeButton.addEventListener("click", runTree);
diffButton.addEventListener("click", toggleDiffMode);
historyButton.addEventListener("click", openHistory);
clearButton.addEventListener("click", clearAll);
copyButton.addEventListener("click", copyOutput);
helpFab.addEventListener("click", openHelp);

helpModal.querySelector(".modal__close").addEventListener("click", () => {
  helpModal.close();
});
historyModal.querySelector(".modal__close").addEventListener("click", () => {
  historyModal.close();
});

historyClearAll.addEventListener("click", () => {
  setHistory([]);
  renderHistoryList();
  showToast("Histórico limpo");
});

document.addEventListener("keydown", (e) => {
  const tag = e.target?.tagName;
  const typingInField = tag === "TEXTAREA" || tag === "INPUT";

  if (e.key === "Escape") {
    closeTopModal();
    return;
  }

  // ? abre ajuda (fora de campos, ou Ctrl+/)
  if (
    (e.key === "?" && !typingInField && !isMod(e)) ||
    (isMod(e) && e.key === "/")
  ) {
    e.preventDefault();
    openHelp();
    return;
  }

  if (!isMod(e)) return;

  const key = e.key.toLowerCase();

  if (key === "enter" && e.shiftKey) {
    e.preventDefault();
    runDiff();
    return;
  }

  if (key === "enter") {
    e.preventDefault();
    runFormat();
    return;
  }

  if (key === "m") {
    e.preventDefault();
    runMinify();
    return;
  }

  if (key === "t") {
    e.preventDefault();
    runTree();
    return;
  }

  if (key === "d") {
    e.preventDefault();
    toggleDiffMode();
    return;
  }

  if (key === "h") {
    e.preventDefault();
    openHistory();
    return;
  }

  if (key === "l") {
    e.preventDefault();
    clearAll();
    return;
  }

  if (key === "c" && e.shiftKey) {
    e.preventDefault();
    copyOutput();
  }
});
