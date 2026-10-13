import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Sources that make up dist-beta/. Line endings are normalised so Windows and Linux checkouts agree.
export function betaSourceDigest() {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name).replaceAll("\\", "/");
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk("beta");
  files.push("server/beta-contract-v8.ts", "vite.beta.config.ts");
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const rows = files.map((path) => ({ path, hash: hash(readFileSync(path, "utf8").replaceAll("\r\n", "\n")) }));
  return { sourceDigest: hash(JSON.stringify(rows)), files: rows };
}
