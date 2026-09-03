import { setOutputGutterMode } from "./editor.js";

const OUTPUT_MODE_CLASSES = ["is-error", "is-minified", "is-tree", "is-diff"];

export function createOutput({ outputArea, outputBox, copyButton }) {
  let lastCopyText = "";
  let copyResetTimer = null;

  function resetOutputMode(...modes) {
    outputArea.classList.remove(...OUTPUT_MODE_CLASSES);
    for (const mode of modes) {
      outputArea.classList.add(mode);
    }
  }

  function showCopyButton() {
    copyButton.hidden = false;
  }

  function hideCopyButton() {
    copyButton.hidden = true;
    lastCopyText = "";
  }

  function setGutter(innerLines, text = "") {
    setOutputGutterMode(outputBox, outputArea, innerLines, text);
  }

  function showError(message) {
    hideCopyButton();
    resetOutputMode("is-error");
    outputArea.replaceChildren();
    outputArea.textContent = message;
    setGutter(false, message);
  }

  function renderPlain(text, mode) {
    lastCopyText = text;
    resetOutputMode(mode);
    outputArea.replaceChildren();
    outputArea.textContent = text;
    setGutter(false, text);
    showCopyButton();
  }

  async function copyOutput(showToast) {
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

  return {
    outputArea,
    outputBox,
    getCopyText: () => lastCopyText,
    setCopyText(text) {
      lastCopyText = text;
    },
    resetOutputMode,
    setGutter,
    showCopyButton,
    hideCopyButton,
    showError,
    renderPlain,
    copyOutput,
  };
}
