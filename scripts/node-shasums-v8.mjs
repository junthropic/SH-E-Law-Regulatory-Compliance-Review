// Security review F-13: the node.exe that goes into the MSIX must be the official build of the running Node version.
// This module never goes online. CI (.github/workflows/msix.yml) downloads https://nodejs.org/dist/<version>/SHASUMS256.txt
// before the build and passes the file with --node-shasums; a local build only records the hash.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

// Returns the expected SHA-256 of `entry` (e.g. "win-x64/node.exe") from a SHASUMS256.txt of `version` (e.g. "v24.1.0").
// Throws when the file is for another version, when the entry is missing, or when it is listed more than once.
export function expectedNodeHash(shasums, version, entry) {
  const lines = shasums.split(/\r?\n/).map((l) => /^([0-9a-f]{64}) [ *]?(\S+)$/.exec(l.trim())).filter(Boolean);
  if (!lines.some((m) => m[2].startsWith(`node-${version}-`) || m[2].startsWith(`node-${version}.`)))
    throw new Error(`SHASUMS256.txt 가 Node ${version} 의 목록이 아닙니다.`);
  const found = lines.filter((m) => m[2] === entry);
  if (found.length === 0) throw new Error(`SHASUMS256.txt 에 ${entry} 가 없습니다.`);
  if (found.length > 1) throw new Error(`SHASUMS256.txt 에 ${entry} 가 여러 번 있습니다.`);
  return found[0][1];
}

// The check the build runs before packaging. `shasumsFile` undefined = local build without the list (recorded as unchecked).
export function checkNodeExe({ exe, version, arch, shasumsFile, ci }) {
  const entry = `win-${arch}/node.exe`;
  const actual = sha256File(exe);
  if (!shasumsFile) {
    if (ci) throw new Error("CI 빌드에는 --node-shasums 가 필요합니다(msix.yml이 먼저 공식 SHASUMS256.txt를 받습니다).");
    return { entry, sha256: actual, check: "not checked (local build without --node-shasums)" };
  }
  const expected = expectedNodeHash(readFileSync(shasumsFile, "utf8"), version, entry);
  if (expected !== actual) throw new Error(`node.exe 의 SHA-256이 Node ${version} 공식 SHASUMS256.txt(${entry})와 다릅니다.`);
  return { entry, sha256: actual, check: `matches official SHASUMS256.txt of Node ${version}` };
}
