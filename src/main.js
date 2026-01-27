const inputArea = document.querySelector(".large-area--input");
const outputArea = document.querySelector(".large-area--output");
const formatButton = document.querySelector(".controls__button--format");
const minifyButton = document.querySelector(".controls__button--minify");
const treeButton = document.querySelector(".controls__button--tree");

/* =========================
   Parse inteligente
========================= */
function smartParseJson(input) {
  let text = input.trim();

  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);
  }

  const json = JSON.parse(text);

  for (const key of Object.keys(json)) {
    const value = json[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          json[key] = JSON.parse(trimmed);
        } catch {}
      }
    }
  }

  return json;
}

/* =========================
   Formatação com highlight + collapse
========================= */
function formatJSONWithHighlight(obj, container) {
  container.innerHTML = "";

  /* Copy button */
  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.textContent = "Copy";
  container.appendChild(copyButton);

  copyButton.addEventListener("click", () => {
    try {
      const json = smartParseJson(inputArea.value);
      navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      showToast("JSON copiado!");
    } catch {
      showToast("JSON inválido!");
    }
  });

  const jsonText = JSON.stringify(obj, null, 2);
  const lines = jsonText.split("\n");

  const allBraces = [];
  const lineWrappers = [];

  lines.forEach((line, idx) => {
    const indentCount = (line.match(/^(\s+)/) || [""])[0].length / 2;
    const trimmed = line.trim();
    const opensBlock = /[{[]\s*$/.test(trimmed);

    const wrapper = document.createElement("div");
    wrapper.className = "line-wrapper";
    wrapper.dataset.indent = indentCount;
    wrapper.dataset.index = idx;
    if (opensBlock) wrapper.classList.add("block-opener");

    /* Fold toggle */
    const foldToggle = document.createElement("span");
    foldToggle.className = "fold-toggle";
    foldToggle.textContent = opensBlock ? "▼" : "";

    /* Line number */
    const lineNumber = document.createElement("span");
    lineNumber.className = "line-number";
    lineNumber.textContent = idx + 1;

    /* Line content */
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

    const highlighted = line.replace(
      /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d*)?([eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = "number";
        if (/^"/.test(match)) cls = /:$/.test(match) ? "key" : "string";
        else if (/true|false/.test(match)) cls = "boolean";
        else if (/null/.test(match)) cls = "null";
        return `<span class="${cls}">${match}</span>`;
      },
    );

    content.innerHTML = highlighted.replace(
      /[{}[\]]/g,
      (m) => `<span class="brace">${m}</span>`,
    );

    lineContent.appendChild(indentWrapper);
    lineContent.appendChild(content);

    wrapper.appendChild(foldToggle);
    wrapper.appendChild(lineNumber);
    wrapper.appendChild(lineContent);

    container.appendChild(wrapper);

    content.querySelectorAll(".brace").forEach((b) => allBraces.push(b));
    lineWrappers.push(wrapper);
  });

  /* =========================
     Match de braces
  ========================= */
  const stack = [];
  allBraces.forEach((brace, i) => {
    const ch = brace.textContent;
    if (ch === "{" || ch === "[") stack.push({ brace, index: i });
    else {
      const opener = stack.pop();
      if (opener) {
        brace.dataset.match = opener.index;
        opener.brace.dataset.match = i;
      }
    }
  });

  allBraces.forEach((brace) => {
    brace.addEventListener("click", () => {
      allBraces.forEach((b) => b.classList.remove("brace-active"));
      const match = brace.dataset.match;
      if (match) {
        brace.classList.add("brace-active");
        allBraces[match].classList.add("brace-active");
      }
    });
  });

  /* =========================
     Collapse logic + "..."
  ========================= */
  lineWrappers.forEach((line) => {
    const toggle = line.querySelector(".fold-toggle");
    if (!line.classList.contains("block-opener")) return;

    let collapsed = false;
    let dotsLine = null;

    toggle.addEventListener("click", () => {
      collapsed = !collapsed;
      toggle.textContent = collapsed ? "▶" : "▼";

      const baseIndent = Number(line.dataset.indent);
      const startIndex = Number(line.dataset.index);

      if (collapsed && !dotsLine) {
        // Detectar se é array e contar elementos
        const lineText = lines[startIndex].trim();
        const isArray = lineText.includes("[");
        let lengthInfo = "";
        
        if (isArray) {
          // Contar quantas linhas estão sendo colapsadas no mesmo nível de indentação + 1
          let itemCount = 0;
          for (let i = startIndex + 1; i < lineWrappers.length; i++) {
            const next = lineWrappers[i];
            const nextIndent = Number(next.dataset.indent);
            if (nextIndent <= baseIndent) break;
            // Contar apenas elementos diretos do array (indent = baseIndent + 1)
            if (nextIndent === baseIndent + 1) {
              const nextLine = lines[i].trim();
              // Verificar se não é apenas um fechamento de bloco
              if (!nextLine.match(/^[\]}],?$/)) {
                itemCount++;
              }
            }
          }
          lengthInfo = ` [${itemCount} ${itemCount === 1 ? 'item' : 'items'}]`;
        }

        dotsLine = document.createElement("div");
        dotsLine.className = "line-wrapper dots-line";
        dotsLine.innerHTML = `
          <span class="fold-toggle"></span>
          <span class="line-number"></span>
          <div class="line">
            <span class="content dots">...${lengthInfo}</span>
          </div>
        `;
        line.after(dotsLine);
      }

      if (!collapsed && dotsLine) {
        dotsLine.remove();
        dotsLine = null;
      }

      for (let i = startIndex + 1; i < lineWrappers.length; i++) {
        const next = lineWrappers[i];
        const nextIndent = Number(next.dataset.indent);
        if (nextIndent <= baseIndent) break;
        next.style.display = collapsed ? "none" : "";
      }

      // Também esconder/mostrar as linhas de "..." dos filhos colapsados
      const allDotsLines = container.querySelectorAll(".dots-line");
      allDotsLines.forEach((dots) => {
        // Verificar se esta linha de dots está dentro do bloco sendo colapsado
        const dotsIndex = Array.from(container.children).indexOf(dots);
        if (dotsIndex > startIndex) {
          // Verificar se está dentro do range do bloco colapsado
          let isInside = false;
          for (let i = startIndex + 1; i < lineWrappers.length; i++) {
            const nextIndent = Number(lineWrappers[i].dataset.indent);
            if (nextIndent <= baseIndent) break;
            if (lineWrappers[i].nextElementSibling === dots) {
              isInside = true;
              break;
            }
          }
          if (isInside) {
            dots.style.display = collapsed ? "none" : "";
          }
        }
      });
    });
  });
}

/* =========================
   JSON → árvore
========================= */
function jsonToTree(obj, prefix = "", isLast = true) {
  const lines = [];
  const entries = Object.entries(obj);

  entries.forEach(([key, value], index) => {
    const last = index === entries.length - 1;
    const connector = last ? "└─ " : "├─ ";
    const nextPrefix = prefix + (isLast ? "   " : "│  ");

    if (typeof value === "object" && value !== null) {
      lines.push(prefix + connector + key);
      lines.push(...jsonToTree(value, nextPrefix, last));
    } else {
      lines.push(prefix + connector + `${key}: ${value}`);
    }
  });

  return lines;
}

/* =========================
   Botões
========================= */
formatButton.addEventListener("click", () => {
  try {
    const json = smartParseJson(inputArea.value);
    formatJSONWithHighlight(json, outputArea);
  } catch (e) {
    outputArea.textContent = `Invalid JSON!\n${e.message}`;
  }
});

minifyButton.addEventListener("click", () => {
  try {
    const json = smartParseJson(inputArea.value);
    outputArea.textContent = JSON.stringify(json);
  } catch (e) {
    outputArea.textContent = `Invalid JSON!\n${e.message}`;
  }
});

treeButton.addEventListener("click", () => {
  try {
    const json = smartParseJson(inputArea.value);
    outputArea.innerHTML = `<pre>${jsonToTree(json).join("\n")}</pre>`;
  } catch (e) {
    outputArea.textContent = `Invalid JSON!\n${e.message}`;
  }
});

/* =========================
   Toast
========================= */
function showToast(message, duration = 2000) {
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  document.body.appendChild(toast);

  getComputedStyle(toast).opacity;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove());
  }, duration);
}
