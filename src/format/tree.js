export function formatValueLabel(value) {
  if (value === null) return { text: "null", cls: "null" };
  if (typeof value === "boolean") return { text: String(value), cls: "boolean" };
  if (typeof value === "number") return { text: String(value), cls: "number" };
  return { text: JSON.stringify(String(value)), cls: "" };
}

export function treeToPlainText(value, prefix = "", isLast = true) {
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
