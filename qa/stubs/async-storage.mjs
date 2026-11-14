/**
 * In-memory AsyncStorage stand-in for QA runs.
 * The store lives on globalThis so a "cold start" can keep the same data,
 * exactly like a real device would.
 */
const store = (globalThis.__CALCOUNT_QA_STORAGE__ ??= new Map());

const api = {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async setItem(key, value) {
    store.set(key, String(value));
  },
  async removeItem(key) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
  async getAllKeys() {
    return [...store.keys()];
  },
  async multiGet(keys) {
    return keys.map((key) => [key, store.has(key) ? store.get(key) : null]);
  },
  async multiSet(entries) {
    for (const [key, value] of entries) store.set(key, String(value));
  },
  async multiRemove(keys) {
    for (const key of keys) store.delete(key);
  },
  async mergeItem(key, value) {
    store.set(key, String(value));
  },
};

export default api;
export const __store = store;
