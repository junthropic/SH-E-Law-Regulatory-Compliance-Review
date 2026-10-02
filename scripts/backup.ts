import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { Store, atomicJson } from "../server/store.js";
import { makeBackup } from "../server/backup.js";
const store = new Store();
try {
  if (store.all<any>("reviews").some((r) => r.status === "running"))
    throw new Error("작업을 마친 후 백업하세요.");
  mkdirSync(resolve("backups"), { recursive: true });
  const path = resolve(
    "backups",
    "private-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json",
  );
  atomicJson(path, makeBackup(store));
  console.log("비공개 백업: " + path);
} finally {
  store.close();
}
