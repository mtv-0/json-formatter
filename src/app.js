import { isMod } from "./core/text.js";
import { parseStructured } from "./core/structured.js";
import { serializeXml } from "./core/xml.js";
import { compareInputs } from "./diff/compare.js";
import { createHistoryStore, normalizeHistoryItem } from "./history/store.js";
import { queryAppElements } from "./ui/elements.js";
import {
  bindEditorLines,
  bindOutputGutterScroll,
  updateEditorLines,
} from "./ui/editor.js";
import { createOutput } from "./ui/output.js";
import { createToast } from "./ui/toast.js";
import { createPrettyView } from "./ui/pretty-view.js";
import { renderTree } from "./ui/tree-view.js";
import { createDiffView } from "./ui/diff-view.js";
import { createHistoryView } from "./ui/history-view.js";

const els = queryAppElements();
const showToast = createToast();
const output = createOutput(els);
const pretty = createPrettyView(output);
const diffView = createDiffView({
  boxA: els.inputBoxA,
  boxB: els.inputBoxB,
  overlayA: els.overlayA,
  overlayB: els.overlayB,
  bar: {
    summary: els.diffSummary,
    copy: els.diffCopy,
    details: els.diffDetails,
  },
  detailsModal: els.detailsModal,
  detailsBody: els.detailsBody,
  output,
});
const historyStore = createHistoryStore();

let diffMode = false;

function setDiffMode(enabled) {
  diffMode = enabled;
  els.container.classList.toggle("is-diff", enabled);
  els.diffButton.classList.toggle("is-active", enabled);
  els.inputBoxB.hidden = !enabled;
  els.inputLabelA.hidden = !enabled;
  els.inputLabelB.hidden = !enabled;
  els.diffBar.hidden = !enabled;

  els.formatButton.textContent = enabled ? "Compare" : "Format";
  els.inputArea.setAttribute(
    "aria-label",
    enabled ? "Entrada A" : "Entrada JSON ou XML",
  );
  els.inputArea.placeholder = enabled
    ? "A: JSON, XML ou texto..."
    : "Cole JSON ou XML aqui... (Ctrl+Enter para formatar)";
  els.inputAreaB.setAttribute("aria-label", "Entrada B");
  els.inputAreaB.placeholder = "B: JSON, XML ou texto...";

  if (!enabled) {
    diffView.clear();
    if (els.detailsModal.open) els.detailsModal.close();
  } else {
    updateEditorLines(els.inputAreaB);
    els.inputAreaB.focus();
  }
}

function toggleDiffMode() {
  setDiffMode(!diffMode);
  showToast(
    diffMode
      ? "Modo Diff ativo — Compare ou Ctrl+Shift+Enter"
      : "Modo Diff desativado",
  );
}

function applyFormat(text) {
  const parsed = parseStructured(text);
  if (parsed.kind === "xml") {
    pretty.formatXml(parsed.doc, text);
  } else {
    pretty.formatJSON(parsed.value);
  }
}

function applyMinify(text) {
  const parsed = parseStructured(text);
  if (parsed.kind === "xml") {
    output.renderPlain(
      serializeXml(parsed.doc, { pretty: false, originalText: text }),
      "is-minified",
    );
  } else {
    output.renderPlain(JSON.stringify(parsed.value), "is-minified");
  }
}

function applyTree(text) {
  renderTree(output, parseStructured(text).value);
}

function applyDiff(textA, textB) {
  const result = compareInputs(textA, textB);
  if (els.inputArea.value !== result.textA) {
    els.inputArea.value = result.textA;
    updateEditorLines(els.inputArea);
  }
  if (els.inputAreaB.value !== result.textB) {
    els.inputAreaB.value = result.textB;
    updateEditorLines(els.inputAreaB);
  }
  diffView.paint(result);
  return result.kind;
}

function runFormat() {
  if (diffMode) {
    runDiff();
    return;
  }

  try {
    applyFormat(els.inputArea.value);
    historyStore.pushHistoryEntry({ mode: "format", text: els.inputArea.value });
  } catch (e) {
    output.showError(`Entrada inválida!\n${e.message}`);
  }
}

function runMinify() {
  if (diffMode) {
    setDiffMode(false);
    showToast("Diff desativado para mostrar o Minify");
  }
  try {
    applyMinify(els.inputArea.value);
    historyStore.pushHistoryEntry({ mode: "minify", text: els.inputArea.value });
  } catch (e) {
    output.showError(`Entrada inválida!\n${e.message}`);
  }
}

function runTree() {
  if (diffMode) {
    setDiffMode(false);
    showToast("Diff desativado para mostrar a Tree");
  }
  try {
    applyTree(els.inputArea.value);
    historyStore.pushHistoryEntry({ mode: "tree", text: els.inputArea.value });
  } catch (e) {
    output.showError(`Entrada inválida!\n${e.message}`);
  }
}

function runDiff() {
  if (!diffMode) {
    setDiffMode(true);
    showToast("Modo Diff ativo — cole A e B");
    return;
  }

  const textA = els.inputArea.value;
  const textB = els.inputAreaB.value;
  if (!textA.trim() || !textB.trim()) {
    showToast("Preencha A e B para comparar.", true);
    return;
  }

  try {
    applyDiff(textA, textB);
    historyStore.pushHistoryEntry({ mode: "diff", text: textA, textB });
  } catch (e) {
    showToast(`Não foi possível comparar: ${e.message}`, true);
  }
}

function restoreHistoryItem(raw) {
  const item = normalizeHistoryItem(raw);
  if (!item) return;

  const mode = item.mode || "format";
  setDiffMode(mode === "diff");
  els.inputArea.value = item.text;
  els.inputAreaB.value = mode === "diff" ? item.textB : "";
  updateEditorLines(els.inputArea);
  updateEditorLines(els.inputAreaB);

  try {
    if (mode === "diff") {
      if (!item.textB.trim()) {
        showToast("Diff restaurado — complete o lado B", false, 2500);
      } else {
        applyDiff(item.text, item.textB);
        showToast("Diff restaurado");
      }
    } else if (mode === "minify") {
      applyMinify(item.text);
      showToast("Minify restaurado");
    } else if (mode === "tree") {
      applyTree(item.text);
      showToast("Tree restaurado");
    } else {
      applyFormat(item.text);
      showToast("Format restaurado");
    }
  } catch (e) {
    output.showError(`Não foi possível reprocessar:\n${e.message}`);
    showToast("Entrada restaurada (saída com erro)", true);
  }

  els.historyModal.close();
  els.inputArea.focus();
}

const historyView = createHistoryView({
  els,
  store: historyStore,
  showToast,
  onRestore: restoreHistoryItem,
});

function clearAll() {
  els.inputArea.value = "";
  els.inputAreaB.value = "";
  updateEditorLines(els.inputArea);
  updateEditorLines(els.inputAreaB);
  output.resetOutputMode();
  output.outputArea.replaceChildren();
  output.setGutter(false, "");
  output.hideCopyButton();
  diffView.clear();
  els.inputArea.focus();
}

function openHelp() {
  els.helpModal.showModal();
}

function closeTopModal() {
  if (els.helpModal.open) els.helpModal.close();
  else if (els.historyModal.open) els.historyModal.close();
  else if (els.detailsModal.open) els.detailsModal.close();
}

els.formatButton.addEventListener("click", runFormat);
els.minifyButton.addEventListener("click", runMinify);
els.treeButton.addEventListener("click", runTree);
els.diffButton.addEventListener("click", toggleDiffMode);
els.historyButton.addEventListener("click", historyView.open);
els.clearButton.addEventListener("click", clearAll);
els.copyButton.addEventListener("click", () => output.copyOutput(showToast));
els.diffCopy.addEventListener("click", () => output.copyOutput(showToast));
els.diffDetails.addEventListener("click", () => diffView.openDetails());
els.inputArea.addEventListener("input", () => {
  if (diffView.isPainted()) diffView.clear({ keepSummary: true });
});
els.inputAreaB.addEventListener("input", () => {
  if (diffView.isPainted()) diffView.clear({ keepSummary: true });
});
els.helpFab.addEventListener("click", openHelp);
els.helpModal.querySelector(".modal__close").addEventListener("click", () => {
  els.helpModal.close();
});

bindEditorLines(els.inputArea);
bindEditorLines(els.inputAreaB);
bindOutputGutterScroll(els.outputBox, els.outputArea);
pretty.bindBraceHighlight();
output.setGutter(false, "");

document.addEventListener("keydown", (e) => {
  const tag = e.target?.tagName;
  const typingInField = tag === "TEXTAREA" || tag === "INPUT";

  if (e.key === "Escape") {
    closeTopModal();
    return;
  }

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
    historyView.open();
    return;
  }

  if (key === "l") {
    e.preventDefault();
    clearAll();
    return;
  }

  if (key === "c" && e.shiftKey) {
    e.preventDefault();
    output.copyOutput(showToast);
  }
});
