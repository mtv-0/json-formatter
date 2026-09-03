import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createHistoryStore,
  HISTORY_MAX,
  normalizeHistoryItem,
} from "../../src/history/store.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    data,
  };
}

describe("history store", () => {
  it("normaliza itens antigos", () => {
    assert.equal(normalizeHistoryItem(null), null);
    assert.equal(normalizeHistoryItem({ source: "minify", text: "{}" }).mode, "minify");
    assert.equal(normalizeHistoryItem({ source: "diff-a", text: "a" }).mode, "diff");
  });

  it("ignora entrada vazia", () => {
    const store = createHistoryStore(memoryStorage());
    store.pushHistoryEntry({ mode: "format", text: "   " });
    assert.equal(store.getHistory().length, 0);
  });

  it("grava e deduplica o mesmo item", () => {
    const store = createHistoryStore(memoryStorage());
    store.pushHistoryEntry({ mode: "format", text: '{"a":1}' }, 1);
    store.pushHistoryEntry({ mode: "format", text: '{"a":1}' }, 2);
    assert.equal(store.getHistory().length, 1);
  });

  it("mantém A e B no modo diff", () => {
    const store = createHistoryStore(memoryStorage());
    store.pushHistoryEntry({ mode: "diff", text: "a", textB: "b" }, 10);
    const [item] = store.getHistory();
    assert.equal(item.mode, "diff");
    assert.equal(item.textB, "b");
    assert.match(item.preview, /↔/);
  });

  it("respeita o limite máximo", () => {
    const store = createHistoryStore(memoryStorage());
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      store.pushHistoryEntry({ mode: "format", text: `item-${i}` }, i);
    }
    assert.equal(store.getHistory().length, HISTORY_MAX);
  });

  it("tolera JSON inválido no storage", () => {
    const storage = memoryStorage({ "json-formatter-history": "{broken" });
    const store = createHistoryStore(storage);
    assert.deepEqual(store.getHistory(), []);
  });
});
