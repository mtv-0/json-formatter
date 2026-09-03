import { serializeXml } from "../core/xml.js";
import {
  highlightLine,
  highlightXmlLine,
  isXmlBlockOpener,
} from "../format/highlight.js";

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

function renderHighlightedLines(text, output, { highlight, opensBlock }) {
  const container = output.outputArea;
  output.resetOutputMode();
  container.replaceChildren();
  output.showCopyButton();
  output.setGutter(true);

  const lines = text.split("\n");
  const fragment = document.createDocumentFragment();
  const allBraces = [];
  const lineWrappers = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const indentCount = (line.match(/^(\s*)/) || [""])[0].length / 2;
    const trimmed = line.trim();
    const opens = opensBlock(trimmed);

    const wrapper = document.createElement("div");
    wrapper.className = "line-wrapper";
    wrapper.dataset.indent = String(indentCount);
    wrapper.dataset.index = String(idx);
    if (opens) {
      wrapper.classList.add("block-opener");
      wrapper.dataset.collapsed = "false";
    }

    const foldToggle = document.createElement("span");
    foldToggle.className = "fold-toggle";
    foldToggle.textContent = opens ? "▼" : "";
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
    content.innerHTML = highlight(line);

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

export function createPrettyView(output) {
  function formatJSON(obj) {
    const jsonText = JSON.stringify(obj, null, 2);
    output.setCopyText(jsonText);
    renderHighlightedLines(jsonText, output, {
      highlight: highlightLine,
      opensBlock: (trimmed) => /[{[]\s*$/.test(trimmed),
    });
  }

  function formatXml(doc, originalText) {
    const xmlText = serializeXml(doc, { pretty: true, originalText });
    output.setCopyText(xmlText);
    renderHighlightedLines(xmlText, output, {
      highlight: highlightXmlLine,
      opensBlock: isXmlBlockOpener,
    });
  }

  function bindBraceHighlight() {
    output.outputArea.addEventListener("click", (e) => {
      const brace = e.target.closest(".brace");
      if (!brace || !output.outputArea.contains(brace)) return;

      output.outputArea.querySelectorAll(".brace-active").forEach((b) => {
        b.classList.remove("brace-active");
      });

      const match = brace.dataset.match;
      if (match == null) return;

      brace.classList.add("brace-active");
      const braces = output.outputArea.querySelectorAll(".brace");
      const pair = braces[Number(match)];
      if (pair) pair.classList.add("brace-active");
    });
  }

  return { formatJSON, formatXml, bindBraceHighlight };
}
