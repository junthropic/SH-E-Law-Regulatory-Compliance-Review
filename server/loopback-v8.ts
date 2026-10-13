import type { FastifyInstance } from "fastify";

export const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PEERS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// The installed app only serves the local user. Refuse to bind anywhere but 127.0.0.1,
// and drop any request whose peer is not the loopback interface (defence in depth).
export function restrictToLoopback(app: FastifyInstance) {
  const listen = app.listen.bind(app) as (...args: unknown[]) => unknown;
  (app as unknown as { listen: unknown }).listen = (opts?: unknown, ...rest: unknown[]) => {
    const host = opts && typeof opts === "object" ? (opts as { host?: unknown }).host : undefined;
    if (host !== LOOPBACK_HOST)
      return Promise.reject(new Error("서버는 127.0.0.1에만 열 수 있습니다."));
    return listen(opts, ...rest);
  };
  app.addHook("onRequest", async (req, reply) => {
    if (!LOOPBACK_PEERS.has(req.socket.remoteAddress || ""))
      return reply.code(403).send({ error: "이 PC 안에서만 접속할 수 있습니다." });
  });
}
