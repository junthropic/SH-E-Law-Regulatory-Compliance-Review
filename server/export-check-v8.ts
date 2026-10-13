import { Store, sha } from "./store.js";
import { guardManagedExport } from "./records-v6.js";
import { EgressDenied } from "./egress-v3.js";
import type { Execution } from "./egress-execution-v4.js";

// Preview switch for the v7 safety-manager connection (stage 2 wires it into the screen). Default off.
export const PREVIEW_SWITCH = "preview.safetyManagerV7";
export const previewOn = (store: Store) => store.setting<boolean>(PREVIEW_SWITCH, false) === true;
const PROTECTED_RULES = /^(safety_manager|training)\./;

// B-3: with the switch on, every review export is checked — including reviews with no protected binding
// and the reviewer packet. With the switch off, behaviour is exactly the previous guardManagedExport.
export function checkReviewExport(store: Store, id: string, kind: "export" | "reviewer-packet", context?: Execution) {
  if (!previewOn(store)) return kind === "export" ? guardManagedExport(store, id, context) : undefined;
  const bound = store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='v6_review_bindings'").get() &&
    store.db.prepare("SELECT 1 FROM v6_review_bindings WHERE review=?").get(id);
  if (bound) {
    const derived = guardManagedExport(store, id, context);
    store.audit("export_checked", `${kind} ${id} protected`);
    return derived;
  }
  const r = store.review(id);
  if (!r) throw new EgressDenied();
  // An unbound review must not carry protected case references, and its evidence must still match its hashes.
  if (r.issues.some((i) => PROTECTED_RULES.test(i.ruleId ?? "")) || r.evidence.some((e) => sha(e.text) !== e.hash))
    throw new EgressDenied();
  store.audit("export_checked", `${kind} ${id} unbound`);
  return undefined;
}
