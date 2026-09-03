import { compactPreview } from "../core/text.js";

export const HISTORY_KEY = "json-formatter-history";

export const HISTORY_MAX = 25;

export const MODE_LABELS = {
  format: "Format",
  minify: "Minify",
  tree: "Tree",
  diff: "Diff",
};

export function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;

  // Entradas antigas (só text/source)
  if (!item.mode) {
    const source = item.source || "format";
    if (source === "diff-a" || source === "diff-b") {
      return {
        ...item,
        mode: "diff",
        text: item.text || "",
        textB: "",
      };
    }
    return {
      ...item,
      mode: ["format", "minify", "tree"].includes(source) ? source : "format",
      text: item.text || "",
      textB: "",
    };
  }

  return {
    ...item,
    text: item.text || "",
    textB: item.textB || "",
  };
}

export function formatHistoryDate(ts) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function createHistoryStore(storage = globalThis.localStorage) {
  function getHistory() {
    try {
      const raw = storage?.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function setHistory(items) {
    storage?.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  }

  function pushHistoryEntry({ mode, text, textB = "" }, now = Date.now()) {
    const trimmed = text.trim();
    if (!trimmed) return getHistory();

    const trimmedB = textB.trim();
    const items = getHistory().filter((raw) => {
      const item = normalizeHistoryItem(raw);
      if (!item) return false;
      if (mode === "diff") {
        return !(
          item.mode === "diff" &&
          item.text === trimmed &&
          item.textB === trimmedB
        );
      }
      return !(item.mode === mode && item.text === trimmed && !item.textB);
    });

    const label = MODE_LABELS[mode] || mode;
    const preview =
      mode === "diff"
        ? `${label} · ${compactPreview(trimmed, 36)} ↔ ${compactPreview(trimmedB, 36)}`
        : `${label} · ${compactPreview(trimmed)}`;

    items.unshift({
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      mode,
      text: trimmed,
      textB: mode === "diff" ? trimmedB : "",
      preview,
      ts: now,
    });
    setHistory(items);
    return items;
  }

  return { getHistory, setHistory, pushHistoryEntry };
}
