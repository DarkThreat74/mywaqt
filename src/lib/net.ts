// True on cellular / data-saver / very slow links. Used to gate the big
// model downloads (~50MB+ of mediapipe/wasm/model files) so a first feature
// open on mobile data doesn't silently burn a user's plan. Browsers without
// NetworkInformation return false — the feature just works.
export function meteredConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.type === "cellular" || c.effectiveType === "2g" || c.effectiveType === "slow-2g");
}
