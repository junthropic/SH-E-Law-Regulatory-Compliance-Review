import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Vault } from "./vault.js";

// v8 at-rest encryption for the installed single-user app.
// One 256-bit data key per installation, wrapped by the Windows user key (DPAPI) through Vault.
// Rows and files are sealed with AES-256-GCM; the table+id (or file name) is bound as AAD so
// ciphertext cannot be moved to another row or file.
const TEXT_PREFIX = "she-enc:v8:";
const FILE_MAGIC = Buffer.from("SHEENC08");
export const STORAGE_KEY_NAME = "storage-key";

export class StorageLockedError extends Error {
  constructor() {
    super("암호화된 자료를 열 키가 없습니다. 같은 PC의 같은 Windows 사용자로 실행하세요.");
    this.name = "StorageLockedError";
  }
}

export class StorageCipher {
  readonly id: string;
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error("저장 암호 키 길이 오류");
    this.id = createHash("sha256").update(key).digest("hex").slice(0, 16);
  }
  private seal(plain: Buffer, aad: string) {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", this.key, iv);
    c.setAAD(Buffer.from(aad));
    const body = Buffer.concat([c.update(plain), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  }
  private open(sealed: Buffer, aad: string) {
    const d = createDecipheriv("aes-256-gcm", this.key, sealed.subarray(0, 12));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(sealed.subarray(12, 28));
    return Buffer.concat([d.update(sealed.subarray(28)), d.final()]);
  }
  sealText(plain: string, aad: string) {
    return TEXT_PREFIX + this.seal(Buffer.from(plain, "utf8"), aad).toString("base64");
  }
  openText(stored: string, aad: string) {
    return this.open(Buffer.from(stored.slice(TEXT_PREFIX.length), "base64"), aad).toString("utf8");
  }
  sealBytes(plain: Buffer, aad: string) {
    return Buffer.concat([FILE_MAGIC, this.seal(plain, aad)]);
  }
  openBytes(stored: Buffer, aad: string) {
    return this.open(stored.subarray(FILE_MAGIC.length), aad);
  }
}
export const isSealedText = (s: string) => s.startsWith(TEXT_PREFIX);
export const isSealedBytes = (b: Buffer) =>
  b.length > FILE_MAGIC.length && b.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);

// Production key source: DPAPI-wrapped data key next to the database. Windows only.
export async function loadStorageCipher(dir: string, vault = new Vault(dir, false)) {
  const existing = existsSync(join(dir, STORAGE_KEY_NAME + ".dpapi"))
    ? await vault.read<{ key: string }>(STORAGE_KEY_NAME)
    : undefined;
  if (existing?.key) return new StorageCipher(Buffer.from(existing.key, "base64"));
  const key = randomBytes(32);
  await vault.write(STORAGE_KEY_NAME, { key: key.toString("base64") });
  // Read back through DPAPI before any data is sealed with it.
  const check = await vault.read<{ key: string }>(STORAGE_KEY_NAME);
  if (check?.key !== key.toString("base64")) throw new Error("저장 암호 키 확인 실패");
  return new StorageCipher(key);
}

// Installed app (Windows): always encrypt. Other platforms are development only and run unencrypted.
export async function openProductionCipher(dir: string) {
  if (process.platform !== "win32") {
    console.warn("Windows가 아니어서 저장 암호화(DPAPI)를 사용하지 않습니다. 개발용 실행입니다.");
    return undefined;
  }
  return loadStorageCipher(dir);
}
