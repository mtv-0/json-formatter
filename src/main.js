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

  // Se a string estiver entre aspas, remove elas primeiro
  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);
  }

  const json = JSON.parse(text);

  // Tenta converter strings internas que pareçam JSON
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

  // Cria o botão de copiar rápido
  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.textContent = "Copiar";
  container.appendChild(copyButton);

  copyButton.addEventListener("click", () => {
    try {
      const json = smartParseJson(inputArea.value);
      navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      showToast("Copiado para a área de transferência!");
    } catch {
      showToast("Erro ao processar JSON!");
    }
  });

  const jsonText = JSON.stringify(obj, null, 2);
  const lines = jsonText.split("\n");

  const allBraces = [];
  const lineWrappers = [];

  // Cria cada linha do JSON formatado
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

    // Número da linha lateral
    const lineNumber = document.createElement("span");
    lineNumber.className = "line-number";
    lineNumber.textContent = idx + 1;

    /* Line content */
    const lineContent = document.createElement("div");
    lineContent.className = "line";

    // Linhas verticais de indentação
    const indentWrapper = document.createElement("div");
    indentWrapper.className = "indent-lines";
    for (let i = 0; i < indentCount; i++) {
      const il = document.createElement("div");
      il.className = "indent-line";
      indentWrapper.appendChild(il);
    }

    const content = document.createElement("span");
    content.className = "content";

    // Realce de sintaxe manual (chaves, strings, números, etc)
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

    // Armazenar estado no próprio elemento
    line.dataset.collapsed = "false";

    toggle.addEventListener("click", () => {
      const isCollapsed = line.dataset.collapsed === "true";
      const newCollapsed = !isCollapsed;
      line.dataset.collapsed = newCollapsed.toString();
      toggle.textContent = newCollapsed ? "▶" : "▼";

      const baseIndent = Number(line.dataset.indent);
      const startIndex = Number(line.dataset.index);

      // Gerenciar linha de "..."
      let dotsLine = line.nextElementSibling;
      if (dotsLine && !dotsLine.classList.contains("dots-line")) {
        dotsLine = null;
      }

      if (newCollapsed && !dotsLine) {
        const lineText = lines[startIndex].trim();
        
        const isArray = lineText.endsWith("[");
        
        if (isArray) {
            let lengthInfo = "";
            let itemCount = 0;
            for (let i = startIndex + 1; i < lineWrappers.length; i++) {
              const next = lineWrappers[i];
              const nextIndent = Number(next.dataset.indent);
              if (nextIndent <= baseIndent) break;
              if (nextIndent === baseIndent + 1) {
                const nextLine = lines[i].trim();
                // Conta itens que não sejam apenas fechamentos de bloco em strings formatadas
                if (!nextLine.match(/^[\]}],?$/)) {
                  itemCount++;
                }
              }
            }
            lengthInfo = ` [${itemCount} ${itemCount === 1 ? 'item' : 'itens'}]`;

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
      } else if (!newCollapsed && dotsLine) {
        dotsLine.remove();
      }

      // Mostrar/esconder linhas filhas
      for (let i = startIndex + 1; i < lineWrappers.length; i++) {
        const next = lineWrappers[i];
        const nextIndent = Number(next.dataset.indent);
        if (nextIndent <= baseIndent) break;
        
        if (newCollapsed) {
          next.style.display = "none";
        } else {
          let shouldShow = true;
          let currentIndent = nextIndent;
          
          /* Verifica se existe algum pai acima na árvore que está recolhido */
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
          
          // Se for uma linha de reticências, decide se ela deve aparecer
          if (next.classList.contains("dots-line")) {
            const prevElement = next.previousElementSibling;
            if (prevElement && prevElement.classList.contains("block-opener")) {
              if (prevElement.dataset.collapsed === "true" && shouldShow) {
                next.style.display = "";
              } else {
                next.style.display = "none";
              }
            }
          } else {
            next.style.display = shouldShow ? "" : "none";
          }
        }
      }

      /* Garante que se fecharmos um pai, as reticências dos filhos também sumam */
      if (newCollapsed) {
        for (let i = startIndex + 1; i < lineWrappers.length; i++) {
          const next = lineWrappers[i];
          const nextIndent = Number(next.dataset.indent);
          if (nextIndent <= baseIndent) break;
          
          const nextDotsLine = next.nextElementSibling;
          if (nextDotsLine && nextDotsLine.classList.contains("dots-line")) {
            nextDotsLine.style.display = "none";
          }
        }
      }
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
    outputArea.textContent = `JSON Inválido!\n${e.message}`;
  }
});

// Evento do botão "Minificar"
minifyButton.addEventListener("click", () => {
  try {
    const json = smartParseJson(inputArea.value);
    outputArea.textContent = JSON.stringify(json);
  } catch (e) {
    outputArea.textContent = `JSON Inválido!\n${e.message}`;
  }
});

// Evento do botão "Árvore"
treeButton.addEventListener("click", () => {
  try {
    const json = smartParseJson(inputArea.value);
    outputArea.innerHTML = `<pre>${jsonToTree(json).join("\n")}</pre>`;
  } catch (e) {
    outputArea.textContent = `JSON Inválido!\n${e.message}`;
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

  // Força um reflow para a animação funcionar
  getComputedStyle(toast).opacity;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove());
  }, duration);
}
