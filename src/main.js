const inputArea = document.querySelector(".large-area--input");
const outputArea = document.querySelector(".large-area--output");
const formatButton = document.querySelector(".controls__button--format");
const minifyButton = document.querySelector(".controls__button--minify");
const treeButton = document.querySelector(".controls__button--tree");

/* Parse inteligente */
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

/* Formata JSON com highlight, braces clicáveis e linhas numeradas */
function formatJSONWithHighlight(obj, container) {
  container.innerHTML = "";

  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.textContent = "Copy";
  outputArea.appendChild(copyButton);

  copyButton.addEventListener("click", () => {
    try {
      const json = smartParseJson(inputArea.value);
      const formatted = JSON.stringify(json, null, 2);
      navigator.clipboard.writeText(formatted);
      showToast("JSON copiado!");
    } catch {
      showToast("JSON inválido!");
    }
  });

  const json = JSON.stringify(obj, null, 2);
  const lines = json.split("\n");
  const allBraces = [];

  lines.forEach((line, idx) => {
    const div = document.createElement("div");
    div.className = "line-wrapper";

    const lineNumber = document.createElement("span");
    lineNumber.className = "line-number";
    lineNumber.textContent = idx + 1;

    const lineContent = document.createElement("div");
    lineContent.className = "line";

    const indentCount = (line.match(/^(\s+)/) || [""])[0].length / 2;
    const indentWrapper = document.createElement("div");
    indentWrapper.className = "indent-lines";
    for (let i = 0; i < indentCount; i++) {
      const lineEl = document.createElement("div");
      lineEl.className = "indent-line";
      indentWrapper.appendChild(lineEl);
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
      }
    );

    content.innerHTML = highlighted.replace(
      /[{}[\]]/g,
      (m) => `<span class="brace">${m}</span>`
    );

    lineContent.appendChild(indentWrapper);
    lineContent.appendChild(content);
    div.appendChild(lineNumber);
    div.appendChild(lineContent);
    container.appendChild(div);

    content.querySelectorAll(".brace").forEach((b) => allBraces.push(b));
  });

  // Correspondência entre braces
  const stack = [];
  allBraces.forEach((brace, i) => {
    const ch = brace.textContent;
    if (ch === "{" || ch === "[") stack.push({ brace, type: ch, index: i });
    else if (ch === "}" || ch === "]") {
      const opener = stack.pop();
      if (opener) {
        brace.dataset.match = opener.index;
        opener.brace.dataset.match = i;
      }
    }
  });

  // Clique para highlight do par
  allBraces.forEach((brace) => {
    brace.addEventListener("click", () => {
      allBraces.forEach((b) => b.classList.remove("brace-active"));
      const matchIdx = brace.dataset.match;
      if (matchIdx !== undefined) {
        brace.classList.add("brace-active");
        allBraces[matchIdx].classList.add("brace-active");
      }
    });
  });
}

/* Converte JSON em árvore visual */
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

/* Botões */
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
    const tree = jsonToTree(json).join("\n");
    outputArea.innerHTML = `<pre>${tree}</pre>`;
  } catch (e) {
    outputArea.textContent = `Invalid JSON!\n${e.message}`;
  }
});

function showToast(message, duration = 2000) {
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  document.body.appendChild(toast);

  // força o reflow para animação
  getComputedStyle(toast).opacity;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove());
  }, duration);
}
