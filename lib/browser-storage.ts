export type BrowserStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

/**
 * Transfers an existing same-origin value only when the new key is absent.
 * The legacy value is removed only after its exact value has been written.
 */
export function migrateLegacyStorageKey(
  storage: BrowserStorage,
  legacyKey: string,
  currentKey: string,
) {
  const current = storage.getItem(currentKey);
  if (current !== null) return current;
  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return null;
  storage.setItem(currentKey, legacy);
  if (storage.getItem(currentKey) === legacy) storage.removeItem(legacyKey);
  return legacy;
}
