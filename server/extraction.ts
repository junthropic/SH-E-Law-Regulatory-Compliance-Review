import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

export type Extraction = {
  success: true;
  markdown: string;
  warnings: { message: string }[];
};
/** A malformed document must not block or crash the local HTTP/SQLite process. */
export function extractDocument(buffer: Buffer): Promise<Extraction> {
  if (buffer.length > 20 * 1024 * 1024)
    return Promise.reject(new Error("문서 용량 초과"));
  return new Promise((resolve, reject) => {
    const worker = fork(
      fileURLToPath(
        new URL(
          import.meta.url.endsWith(".ts")
            ? "./parse-worker.ts"
            : "./parse-worker.js",
          import.meta.url,
        ),
      ),
      [],
      {
        windowsHide: true,
        execArgv: ["--max-old-space-size=256"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      },
    );
    let settled = false;
    const finish = (error?: Error, result?: Extraction) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.kill();
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "문서 추출 시간 한도(30초)를 초과했습니다. 문서를 나누거나 텍스트로 변환하세요.",
          ),
        ),
      30000,
    );
    worker.once("error", () =>
      finish(new Error("문서 추출 프로세스를 시작할 수 없습니다.")),
    );
    worker.once("exit", () =>
      finish(new Error("문서 추출 실패 또는 메모리 한도 초과")),
    );
    worker.once("message", (message: any) => {
      if (
        message?.success !== true ||
        typeof message.markdown !== "string" ||
        !Array.isArray(message.warnings)
      )
        finish(
          new Error("문서 추출 실패. 지원 형식과 파일 손상 여부를 확인하세요."),
        );
      else finish(undefined, message);
    });
    worker.send(buffer.toString("base64"), (error) => {
      if (error) finish(new Error("문서 추출 프로세스 전달 실패"));
    });
  });
}
