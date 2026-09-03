import { escapeHtml } from "../core/text.js";
import { highlightLine, highlightXmlLine } from "../format/highlight.js";
import {
  buildAlignedRows,
  formatDiffSummary,
  hunksToPatch,
  rowsToSplitLines,
} from "../diff/git.js";
import { typeLabel } from "../diff/semantic.js";

function highlightDiffLine(text, kind) {
  if (kind === "xml") return highlightXmlLine(text);
  if (kind === "json") return highlightLine(text);
  return escapeHtml(text);
}

function renderOverlayCell(cell, sourceKind) {
  const el = document.createElement("div");
  el.className = `diff-git-cell diff-git-cell--${cell.kind}`;

  const ln = document.createElement("span");
  ln.className = "diff-git-ln";
  ln.textContent = cell.line ? String(cell.line) : "";

  const sign = document.createElement("span");
  sign.className = `diff-git-sign diff-git-sign--${cell.kind}`;
  sign.textContent =
    cell.kind === "added" ? "+" : cell.kind === "removed" ? "−" : " ";

  const text = document.createElement("span");
  text.className = "diff-git-text";
  if (cell.kind === "empty") {
    text.textContent = "";
  } else if (cell.html) {
    text.innerHTML = cell.html;
  } else if (cell.kind === "equal") {
    text.innerHTML = highlightDiffLine(cell.text, sourceKind);
  } else {
    text.textContent = cell.text;
  }

  el.appendChild(ln);
  el.appendChild(sign);
  el.appendChild(text);
  return el;
}

function fillOverlay(overlay, cells, kind) {
  overlay.replaceChildren();
  const maxLine = cells.reduce((max, cell) => Math.max(max, cell.line || 0), 1);
  overlay.style.setProperty("--diff-ln-ch", `${String(maxLine).length}ch`);
  const fragment = document.createDocumentFragment();
  for (const cell of cells) {
    fragment.appendChild(renderOverlayCell(cell, kind));
  }
  overlay.appendChild(fragment);
}

function renderCards(changes, container, kind) {
  container.replaceChildren();
  if (changes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "diff-empty";
    empty.textContent =
      kind === "text"
        ? "Nenhum trecho extra para detalhar."
        : "Nenhuma diferença estrutural nos campos.";
    container.appendChild(empty);
    return;
  }

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
    }

    container.appendChild(card);
  }
}

export function createDiffView({
  boxA,
  boxB,
  overlayA,
  overlayB,
  bar,
  detailsModal,
  detailsBody,
  output,
}) {
  let syncingScroll = false;
  let painted = false;

  overlayA.addEventListener("scroll", () => {
    if (syncingScroll) return;
    syncingScroll = true;
    overlayB.scrollTop = overlayA.scrollTop;
    overlayB.scrollLeft = overlayA.scrollLeft;
    syncingScroll = false;
  });
  overlayB.addEventListener("scroll", () => {
    if (syncingScroll) return;
    syncingScroll = true;
    overlayA.scrollTop = overlayB.scrollTop;
    overlayA.scrollLeft = overlayB.scrollLeft;
    syncingScroll = false;
  });

  function bindClickToEdit(overlay, box) {
    let pointerX = 0;
    let pointerY = 0;
    overlay.addEventListener("pointerdown", (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    });
    overlay.addEventListener("click", (event) => {
      const bounds = overlay.getBoundingClientRect();
      const onScrollbar =
        event.clientX > bounds.left + overlay.clientWidth ||
        event.clientY > bounds.top + overlay.clientHeight;
      if (onScrollbar) return;
      if (Math.hypot(event.clientX - pointerX, event.clientY - pointerY) > 6) {
        return;
      }
      clear({ keepSummary: true });
      box.querySelector("textarea")?.focus();
    });
  }

  bindClickToEdit(overlayA, boxA);
  bindClickToEdit(overlayB, boxB);

  function clear({ keepSummary = false } = {}) {
    painted = false;
    boxA.classList.remove("is-diff-overlay");
    boxB.classList.remove("is-diff-overlay");
    overlayA.hidden = true;
    overlayB.hidden = true;
    overlayA.replaceChildren();
    overlayB.replaceChildren();
    if (!keepSummary && bar.summary) {
      bar.summary.textContent = "Cole A e B e clique em Compare";
    }
    if (bar.copy) bar.copy.hidden = true;
    if (bar.details) bar.details.hidden = true;
  }

  function paint(result) {
    const rows = buildAlignedRows(result.textA, result.textB);
    const split = rowsToSplitLines(rows);
    fillOverlay(
      overlayA,
      split.map((pair) => pair.left),
      result.kind,
    );
    fillOverlay(
      overlayB,
      split.map((pair) => pair.right),
      result.kind,
    );

    overlayA.hidden = false;
    overlayB.hidden = false;
    overlayA.scrollTop = 0;
    overlayB.scrollTop = 0;
    boxA.classList.add("is-diff-overlay");
    boxB.classList.add("is-diff-overlay");
    overlayA.title = "Clique para editar A";
    overlayB.title = "Clique para editar B";
    painted = true;

    const summary = formatDiffSummary(result.git, result.changes, result.kind);
    bar.summary.textContent = summary;
    bar.copy.hidden = false;
    bar.details.hidden = false;
    bar.details.textContent = result.changes.length
      ? `Detalhes (${result.changes.length})`
      : "Detalhes";

    if (result.git.identical && result.changes.length === 0) {
      output.setCopyText("Nenhuma diferença encontrada.");
    } else {
      output.setCopyText(hunksToPatch(result.git.hunks));
    }

    renderCards(result.changes, detailsBody, result.kind);
  }

  function openDetails() {
    detailsModal.showModal();
  }

  detailsModal.querySelector(".modal__close").addEventListener("click", () => {
    detailsModal.close();
  });

  return { paint, clear, openDetails, isPainted: () => painted };
}
