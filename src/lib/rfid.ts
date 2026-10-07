/**
 * RFID readers may send a trailing return and cards are commonly stored with
 * mixed casing in older records. Keep one canonical in-memory representation
 * at every boundary (reader, API, and assignment routes).
 */
export function normalizeRfidCard(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Prefer the input element's value for an Enter event. A keyboard-emulating
 * reader can emit its final character and Enter in the same event turn, before
 * React has committed the final onChange state update.
 */
export function resolveRfidScanValue(inputValue: unknown, stateValue: unknown) {
  return normalizeRfidCard(inputValue) || normalizeRfidCard(stateValue);
}
