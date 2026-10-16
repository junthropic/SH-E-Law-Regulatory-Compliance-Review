import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { publicBundlePath } from "./public-bundle.js";
import type { Store } from "./store.js";
import { koreaDate } from "../shared/dates.js";

// v8 stage 4: the MSIX launcher (packaging/msix/launcher) starts the server with SHE_INSTALLED=1.
// In the installed build, features whose traffic would bypass the in-process egress guard are off.
export const isInstalled = () => process.env.SHE_INSTALLED === "1";

// /api/mcp/query runs korean-law-mcp as a child process, so its requests never pass EgressGuard.
export const MCP_OFF_MESSAGE =
  "설치판에서는 법령 MCP 조회를 제공하지 않습니다. 법령은 베타 화면의 ‘API 키 설정’에서 키를 넣고 수집하세요.";

// /api/public/update downloads the maker's GitHub bundle (already refused by EgressGuard); the installed build says why.
export const PUBLIC_UPDATE_OFF_MESSAGE =
  "설치판은 제작자 저장소에서 법령 자료를 받지 않습니다. 법령은 베타 화면의 ‘API 키 설정’에서 키를 넣고 수집하세요.";

// 국민신문고 본인 민원 자동 수집 (Edge browser automation; its traffic never passes EgressGuard). Fixed off in the
// installed build: no setting turns it on, and playwright-core is not shipped.
export const PETITION_OFF_MESSAGE = "설치판에서는 지원하지 않습니다. 국민신문고 회신은 직접 내려받아 자료함에 올리세요.";

// The maker-side update (.github/workflows/public-law-sync.yml) runs only manually, before a new app version (V8-M10).
export function publicLawNotice(publishedAt?: string) {
  const made = publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? `(이 PC에 들어온 자료의 생성일 ${koreaDate(new Date(publishedAt))})` : "";
  return `앱에 들어 있는 공개 법령 초기 자료는 앱을 만들 때의 자료입니다${made}. 새 앱 버전을 낼 때 그때의 공개 법령 자료가 함께 들어갑니다. 설치판은 이 자료를 인터넷으로 받아오지 않습니다. 최신 법령이 필요하면 ‘API 키 설정’에서 법제처 키를 넣고 직접 수집하세요.`;
}

// The old screen's plaintext JSON backup/restore (/api/backup, /api/restore). The installed build keeps only the
// encrypted backup on the 데이터·백업 screen (security review F-04).
export const LEGACY_BACKUP_OFF_MESSAGE = "설치판에서는 지원하지 않습니다. 데이터·백업 화면의 암호화 백업을 쓰세요.";
// The beta data-handling notice item "기존 화면의 백업" in the installed build (V8-K03, user decision 2026-10-17).
export const LEGACY_BACKUP_INSTALLED_NOTICE = "설치판에서는 기존 화면의 JSON 백업을 지원하지 않습니다. 이 화면의 암호화 백업을 쓰세요.";

export const UNINSTALL_NOTICE = "앱을 제거하면 저장된 자료가 삭제됩니다. 먼저 백업하세요.";

// Installed build start-up: import the bundled public law data only when that file differs from the last import.
// Re-importing the same ~28 MB bundle on every start took about 90 seconds on a typical PC.
export function importPublicOnce(store: Store, path: string): "imported" | "unchanged" | "absent" {
  const file = publicBundlePath(path);
  if (!existsSync(file)) return "absent";
  const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (store.setting<{ bundleSha256?: string } | null>("public-bundle-status", null)?.bundleSha256 === digest) return "unchanged";
  store.importPublic(path);
  store.put("settings", "public-bundle-status", { ...store.setting<object>("public-bundle-status", {}), bundleSha256: digest });
  // The import writes ~650 MB through the write-ahead log; fold it into the database so the log file does not stay that size.
  store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  return "imported";
}
