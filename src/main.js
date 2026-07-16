const inputArea = document.querySelector(".large-area--input");
const outputArea = document.querySelector(".large-area--output");
const formatButton = document.querySelector(".controls__button--format");
const minifyButton = document.querySelector(".controls__button--minify");
const treeButton = document.querySelector(".controls__button--tree");
const clearButton = document.querySelector(".controls__button--clear");
const copyButton = document.querySelector(".copy-button");

/** Texto pronto para copiar (formatado, minificado ou árvore) */
let lastCopyText = "";
let toastEl = null;
let toastTimer = null;
let copyResetTimer = null;

const TOKEN_RE =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

const OUTPUT_MODE_CLASSES = ["is-error", "is-minified", "is-tree"];

function resetOutputMode(...modes) {
  outputArea.classList.remove(...OUTPUT_MODE_CLASSES);
  for (const mode of modes) {
    outputArea.classList.add(mode);
  }
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

  // Raiz
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
  resetOutputMode();
  outputArea.replaceChildren();
  hideCopyButton();
  inputArea.focus();
}

/* =========================
   Toast (reutilizado)
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
  try {
    const json = smartParseJson(inputArea.value);
    formatJSONWithHighlight(json, outputArea);
  } catch (e) {
    showError(`JSON Inválido!\n${e.message}`);
  }
}

function runMinify() {
  try {
    const json = smartParseJson(inputArea.value);
    renderMinified(json);
  } catch (e) {
    showError(`JSON Inválido!\n${e.message}`);
  }
}

function runTree() {
  try {
    const json = smartParseJson(inputArea.value);
    renderTree(json);
  } catch (e) {
    showError(`JSON Inválido!\n${e.message}`);
  }
}

formatButton.addEventListener("click", runFormat);
minifyButton.addEventListener("click", runMinify);
treeButton.addEventListener("click", runTree);
clearButton.addEventListener("click", clearAll);
copyButton.addEventListener("click", copyOutput);

inputArea.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runFormat();
  }
});
