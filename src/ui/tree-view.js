import { formatValueLabel, treeToPlainText } from "../format/tree.js";

export function appendTreeNodes(container, value, prefix = "", isLast = true) {
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

export function renderTree(output, value) {
  output.setCopyText(treeToPlainText(value));
  output.resetOutputMode("is-tree");
  output.outputArea.replaceChildren();
  appendTreeNodes(output.outputArea, value);
  output.setGutter(true);
  output.showCopyButton();
}
