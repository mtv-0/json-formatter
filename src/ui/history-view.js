import { compactPreview } from "../core/text.js";
import {
  formatHistoryDate,
  MODE_LABELS,
  normalizeHistoryItem,
} from "../history/store.js";

export function createHistoryView({
  els,
  store,
  showToast,
  onRestore,
}) {
  const { historyModal, historyList, historyEmpty, historyClearAll } = els;

  function renderList() {
    const items = store.getHistory().map(normalizeHistoryItem).filter(Boolean);
    historyList.replaceChildren();
    historyEmpty.hidden = items.length > 0;

    for (const item of items) {
      const li = document.createElement("li");
      li.className = "history-item";

      const main = document.createElement("button");
      main.type = "button";
      main.className = "history-item__main";
      main.title = "Restaurar no editor";

      const preview = document.createElement("span");
      preview.className = "history-item__preview";
      preview.textContent = item.preview || compactPreview(item.text);

      const meta = document.createElement("span");
      meta.className = "history-item__meta";
      const modeLabel = MODE_LABELS[item.mode] || item.mode || "Format";
      meta.textContent = `${modeLabel} · ${formatHistoryDate(item.ts)}`;

      main.appendChild(preview);
      main.appendChild(meta);
      main.addEventListener("click", () => onRestore(item));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "history-item__delete";
      del.setAttribute("aria-label", "Remover item");
      del.textContent = "×";
      del.addEventListener("click", () => {
        store.setHistory(store.getHistory().filter((h) => h.id !== item.id));
        renderList();
      });

      li.appendChild(main);
      li.appendChild(del);
      historyList.appendChild(li);
    }
  }

  function open() {
    renderList();
    historyModal.showModal();
  }

  historyModal.querySelector(".modal__close").addEventListener("click", () => {
    historyModal.close();
  });

  historyClearAll.addEventListener("click", () => {
    store.setHistory([]);
    renderList();
    showToast("Histórico limpo");
  });

  return { open, renderList };
}
