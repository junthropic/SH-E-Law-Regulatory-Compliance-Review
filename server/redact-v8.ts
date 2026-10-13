// v8 log hygiene: error text that reaches the screen, the console or a log file carries
// no file paths, no key-like values and no long free text.
const FS_ERROR = /^(ENOENT|EACCES|EPERM|EBUSY|EISDIR|ENOTDIR|EEXIST)\b/;
export function safeMessage(message: string, dataDir?: string) {
  const fs = FS_ERROR.exec(message);
  if (fs) return `파일을 처리하지 못했습니다 (${fs[1]}).`;
  return maskSensitive(message, dataDir).slice(0, 500);
}
// Same masking without the length cap, for text the user writes on purpose (feedback files).
export function maskSensitive(message: string, dataDir?: string) {
  let m = message;
  if (dataDir) m = m.split(dataDir).join("<자료 폴더>");
  return m
    .replace(/[A-Za-z]:[\/][^\s'"`<>|]*/g, "<경로>")
    .replace(/\\[^\s'"`<>|]+/g, "<경로>")
    .replace(/(?<![\w.])\/(?:home|Users|tmp|var|private|mnt|root|opt)\/[^\s'"`<>|]*/g, "<경로>")
    .replace(/sk-[A-Za-z0-9_-]{16,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+|\b[A-Fa-f0-9]{32,}\b|[A-Za-z0-9+/]{40,}={0,2}/g, "<값>");
}
