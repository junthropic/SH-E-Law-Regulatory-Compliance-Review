import Fastify from "fastify";
import { restrictToLoopback } from "./loopback-v8.js";

// Retire the old preview address without forwarding credentials or opening a second store.
export function createLegacyRedirect() {
  const app = Fastify({ logger: false });
  restrictToLoopback(app);
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer");
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || ""))
      return reply.code(403).send({ error: "로컬 주소로 접속하세요." });
    if (!["GET", "HEAD"].includes(req.method) || req.url.startsWith("/api/"))
      return reply
        .code(410)
        .send({
          error:
            "이전 시험용 주소에서는 저장할 수 없습니다. http://127.0.0.1:4317/#settings 에서 연결 설정을 이용하세요.",
        });
    // Deliberately discard paths and query strings, including old OAuth callbacks.
    return reply.redirect("http://127.0.0.1:4317/#settings", 302);
  });
  app.all("/*", async () => ({}));
  return app;
}
