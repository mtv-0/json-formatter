import { countTextLines } from "../core/text.js";

function renderGutter(gutter, text) {
  const count = countTextLines(text);
  if (Number(gutter.dataset.count || 0) !== count) {
    gutter.dataset.count = String(count);
    let lines = "1";
    for (let i = 2; i <= count; i++) lines += `\n${i}`;
    gutter.textContent = lines;
    gutter.style.minWidth = `${Math.max(2, String(count).length) + 1.25}ch`;
  }
}

export function updateEditorLines(textarea) {
  const box = textarea.closest(".editor-box");
  if (!box) return;
  const gutter = box.querySelector(".editor-box__gutter");
  if (!gutter) return;

  renderGutter(gutter, textarea.value);
  gutter.scrollTop = textarea.scrollTop;
}

export function bindEditorLines(textarea) {
  const sync = () => updateEditorLines(textarea);
  textarea.addEventListener("input", sync);
  textarea.addEventListener("scroll", () => {
    const gutter = textarea
      .closest(".editor-box")
      ?.querySelector(".editor-box__gutter");
    if (gutter) gutter.scrollTop = textarea.scrollTop;
  });
  sync();
}

export function setOutputGutterMode(outputBox, outputArea, innerLines, text = "") {
  if (!outputBox) return;
  outputBox.classList.toggle("has-inner-lines", innerLines);
  if (innerLines) return;

  const gutter = outputBox.querySelector(".editor-box__gutter");
  if (!gutter) return;
  renderGutter(gutter, text);
  gutter.scrollTop = outputArea.scrollTop;
}

export function bindOutputGutterScroll(outputBox, outputArea) {
  outputArea.addEventListener("scroll", () => {
    if (!outputBox || outputBox.classList.contains("has-inner-lines")) return;
    const gutter = outputBox.querySelector(".editor-box__gutter");
    if (gutter) gutter.scrollTop = outputArea.scrollTop;
  });
}
