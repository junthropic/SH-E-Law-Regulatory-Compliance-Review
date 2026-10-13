// Same-origin calls only. The session cookie comes from /api/bootstrap; every change also sends the CSRF token.
let csrf = "";

export type Region = { code: string; name: string; pilot: boolean };
export type Boot = { csrf: string; regions: { asOf: string; regions: Region[] }; version: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function boot(): Promise<Boot> {
  const r = await fetch("/api/bootstrap", { credentials: "same-origin" });
  if (!r.ok) throw new ApiError(r.status, "화면을 새로고침하세요.");
  const b = (await r.json()) as Boot;
  csrf = b.csrf;
  return b;
}

export async function api<T>(path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: unknown): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "content-type": "application/json", "x-csrf-token": csrf },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!r.ok) {
    const message = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : "요청을 처리하지 못했습니다.";
    throw new ApiError(r.status, message);
  }
  return data as T;
}

export async function upload(file: File) {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch("/api/documents", { method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrf }, body: form });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string }).error || "파일을 올리지 못했습니다.");
  return data as { id: string; name: string };
}

// Saves text the server already returned as a local file. Nothing is sent anywhere.
export function saveFile(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type: type + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const koreaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
