import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

export const MAX_PUBLIC_DOWNLOAD = 50_000_000;
export const MAX_PUBLIC_JSON = 256 * 1024 * 1024;

export function publicBundlePath(legacyPath: string) {
  return existsSync(legacyPath + ".gz") ? legacyPath + ".gz" : legacyPath;
}

export function readPublicBundle(path: string): unknown {
  path = publicBundlePath(path);
  const compressed = path.endsWith(".gz");
  if (
    statSync(path).size > (compressed ? MAX_PUBLIC_DOWNLOAD : MAX_PUBLIC_JSON)
  )
    throw new Error("공개 자료 크기 초과");
  const bytes = readFileSync(path);
  const json = compressed
    ? gunzipSync(bytes, { maxOutputLength: MAX_PUBLIC_JSON })
    : bytes;
  return JSON.parse(json.toString("utf8"));
}

export function writePublicBundle(path: string, bundle: unknown) {
  const json = Buffer.from(JSON.stringify(bundle));
  if (json.length > MAX_PUBLIC_JSON)
    throw new Error("공개 자료 압축 해제 크기 한도 초과");
  const bytes = gzipSync(json, { level: 9 });
  if (bytes.length > MAX_PUBLIC_DOWNLOAD)
    throw new Error("공개 자료 압축 크기 한도 초과");
  writeFileSync(path + ".tmp", bytes, { mode: 0o600 });
  renameSync(path + ".tmp", path);
}
