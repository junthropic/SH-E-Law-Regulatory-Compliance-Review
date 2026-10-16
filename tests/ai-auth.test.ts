import { it, expect, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { readResponseStream, buildContext } from "../server/ai.js";
import { ChatGPTAuth, type Account } from "../server/auth.js";
import { Vault } from "../server/vault.js";
import { testStore, request, evidence } from "./helpers.js";

function sse(events: unknown[], crlf = false) {
  const raw = events
    .map((e) => "data: " + JSON.stringify(e) + (crlf ? "\r\n\r\n" : "\n\n"))
    .join("");
  const bytes = new TextEncoder().encode(raw);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3)
          c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    }),
  );
}
it("SSE 한글·CRLF·분할 경계를 처리한다", async () => {
  expect(
    await readResponseStream(
      sse(
        [
          { type: "response.output_text.delta", delta: "시험 응답" },
          { type: "response.completed" },
        ],
        true,
      ),
    ),
  ).toBe("시험 응답");
});
it.each(["response.failed", "response.incomplete", "error"])(
  "일부 응답 뒤 %s 이벤트도 실패 처리한다",
  async (type) => {
    await expect(
      readResponseStream(
        sse([
          { type: "response.output_text.delta", delta: "완료처럼 보이는 값" },
          { type },
        ]),
      ),
    ).rejects.toThrow("미완료");
  },
);
it("완료 이벤트가 없으면 결과를 확정하지 않는다", async () => {
  await expect(
    readResponseStream(
      sse([{ type: "response.output_text.delta", delta: "{}" }]),
    ),
  ).rejects.toThrow("완료 이벤트");
});
it("사용 한도 오류를 자동 유료 API 전환으로 처리하지 않는다", async () => {
  await expect(
    readResponseStream(new Response("{}", { status: 429 })),
  ).rejects.toThrow("429");
});
it("문서 잘림을 누락 범위로 보고한다", () => {
  const r = buildContext(
    request(),
    [evidence({ text: "가".repeat(20000) })],
    [],
  );
  expect(r.omitted).toHaveLength(1);
  expect(r.input).toContain('"complete":false');
});
it("개인정보 치환 후에도 문서 전체 입력 한도를 넘지 않는다", () => {
  const docs = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    name: `시험${i}.txt`,
    text: "a@b.co ".repeat(8000),
    agency: "",
    responseDate: "",
    confirmed: false,
    warnings: [],
  })) as any;
  const context = buildContext(request(), [], docs);
  const sent = JSON.parse(context.input).documents;
  expect(
    sent.reduce((sum: number, d: any) => sum + d.text.length, 0),
  ).toBeLessThanOrEqual(45000);
  expect(sent.some((d: any) => d.text.includes("a@b.co"))).toBe(false);
  expect(context.omitted).toHaveLength(8);
});
it("PKCE·state는 무작위이고 host ID는 안정적이다", async () => {
  const { store, clean } = testStore();
  try {
    const auth = new ChatGPTAuth(store, new Vault(store.dir, true));
    const a = new URL((await auth.start("http://127.0.0.1:4317")).url);
    const b = new URL((await auth.start("http://127.0.0.1:4317")).url);
    expect(a.searchParams.get("ext_agent_host_id")).toBe(
      b.searchParams.get("ext_agent_host_id"),
    );
    expect(a.searchParams.get("state")).not.toBe(b.searchParams.get("state"));
    expect(a.searchParams.get("code_challenge_method")).toBe("S256");
    expect(a.searchParams.get("client_id")).toBe("dynamic_agent_client");
    await expect(
      auth.callback({
        state: a.searchParams.get("state")!,
        code: "x",
        client_id: "issued",
      }),
    ).rejects.toThrow("state");
    auth.cancel();
    await expect(
      auth.callback({
        state: b.searchParams.get("state")!,
        code: "x",
        client_id: "issued",
      }),
    ).rejects.toThrow();
  } finally {
    clean();
  }
});
it("발급 client ID, nonce, 서명, scope를 검증하여 연결한다", async () => {
  const { store, clean } = testStore();
  try {
    const vault = new Vault(store.dir, true);
    const key = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "test-key" };
    let nonce = "";
    const fetcher = vi.fn(async (url: any) => {
      if (String(url).includes("oauth/token"))
        return Response.json({
          access_token: "test-access",
          refresh_token: "test-refresh",
          expires_in: 3600,
          scope: "openid chatgpt.tokens.use.direct",
          id_token: await new SignJWT({ nonce, email: "test@example.test" })
            .setProtectedHeader({ alg: "RS256", kid: "test-key" })
            .setIssuer("https://auth.openai.com")
            .setAudience("issued-client")
            .setSubject("test-subject")
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(key.privateKey),
        });
      if (String(url).includes("openid-configuration"))
        return Response.json({
          issuer: "https://auth.openai.com",
          jwks_uri: "https://auth.openai.com/jwks",
          revocation_endpoint: "https://auth.openai.com/revoke",
        });
      if (String(url).endsWith("/revoke"))
        return new Response(null, { status: 200 });
      return Response.json({ keys: [jwk] });
    });
    const auth = new ChatGPTAuth(store, vault, fetcher as any);
    const url = new URL((await auth.start("http://127.0.0.1:4317")).url);
    nonce = url.searchParams.get("nonce")!;
    await auth.callback({
      state: url.searchParams.get("state")!,
      code: "test-code",
      client_id: "issued-client",
    });
    expect((await auth.status()).planAuthorized).toBe(true);
    expect(await auth.accessToken()).toBe("test-access");
    expect((await vault.read<Account>("chatgpt"))?.clientId).toBe(
      "issued-client",
    );
    expect((await auth.logout()).remoteRevoked).toBe(true);
    expect((await auth.status()).connected).toBe(false);
    // F-07 (user decision 2026-10-17): logout also forgets the stored registration, so the next sign-in starts as a
    // new registration (before: it reused "issued-client").
    const returning = new URL((await auth.start("http://127.0.0.1:4317")).url);
    expect(returning.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(returning.searchParams.get("agent_name_hint")).toBe("SH-E-Law-Check");
    expect(returning.searchParams.has("id_token_hint")).toBe(false);
    expect(await vault.read("chatgpt-registration")).toBeUndefined();
  } finally {
    clean();
  }
});
const account: Account = {
  clientId: "test",
  subject: "test-sub",
  email: "test@example.test",
  accessToken: "old-access",
  refreshToken: "old-refresh",
  idToken: "test-id-token",
  scopes: ["chatgpt.tokens.use.direct"],
  expiresAt: 0,
};
it("손상된 인증정보는 설정 화면을 막지 않고 연결 해제로 복구할 수 있다", async () => {
  const { store, clean } = testStore();
  try {
    const vault = new Vault(store.dir, true);
    await vault.write("chatgpt", { accessToken: "BROKEN-TEST-ONLY" });
    const auth = new ChatGPTAuth(store, vault);
    expect((await auth.status()).storageError).toContain("읽지 못했습니다");
    await auth.logout();
    expect((await auth.status()).storageError).toBe("");
  } finally {
    clean();
  }
});
it.each([0, -1, "3600", null])(
  "잘못된 토큰 수명 %s는 인증정보를 덮어쓰지 않는다",
  async (expires_in) => {
    const { store, clean } = testStore();
    try {
      const vault = new Vault(store.dir, true);
      await vault.write("chatgpt", account);
      const auth = new ChatGPTAuth(
        store,
        vault,
        vi.fn(async () =>
          Response.json({ access_token: "new", expires_in }),
        ) as any,
      );
      await expect(auth.accessToken()).rejects.toThrow("응답 형식");
      expect((await vault.read<Account>("chatgpt"))?.accessToken).toBe(
        account.accessToken,
      );
    } finally {
      clean();
    }
  },
);
it("원격 세션 종료 실패도 로컬 로그아웃을 완료하고 미확인을 알린다", async () => {
  const { store, clean } = testStore();
  try {
    const vault = new Vault(store.dir, true);
    await vault.write("chatgpt", account);
    const fetcher = vi.fn(async (url: any) =>
      String(url).includes("openid-configuration")
        ? Response.json({
            issuer: "https://auth.openai.com",
            revocation_endpoint: "https://auth.openai.com/revoke",
          })
        : new Response(null, { status: 503 }),
    );
    const auth = new ChatGPTAuth(store, vault, fetcher as any);
    const result = await auth.logout();
    expect(result.remoteRevoked).toBe(false);
    expect(result.message).toContain("확인하지 못했습니다");
    expect(await vault.read("chatgpt")).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  } finally {
    clean();
  }
});
it("동시 요청의 토큰 갱신을 한 번만 실행하고 refresh token을 교체한다", async () => {
  const { store, clean } = testStore();
  try {
    const vault = new Vault(store.dir, true);
    await vault.write("chatgpt", account);
    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      }),
    );
    const auth = new ChatGPTAuth(store, vault, fetcher as any);
    expect(await Promise.all([auth.accessToken(), auth.accessToken()])).toEqual(
      ["new-access", "new-access"],
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await vault.read<Account>("chatgpt"))?.refreshToken).toBe(
      "new-refresh",
    );
  } finally {
    clean();
  }
});
it("연결 해제 후 지연된 토큰 응답이 자격증명을 복구하지 않는다", async () => {
  const { store, clean } = testStore();
  try {
    const vault = new Vault(store.dir, true);
    await vault.write("chatgpt", account);
    let complete!: (r: Response) => void;
    const started: Promise<void> = new Promise((resolve) => {
      const fetcher = vi.fn((url: any) =>
        String(url).includes("openid-configuration")
          ? Promise.resolve(
              Response.json({
                issuer: "https://auth.openai.com",
                revocation_endpoint: "https://auth.openai.com/revoke",
              }),
            )
          : String(url).endsWith("/revoke")
            ? Promise.resolve(new Response(null, { status: 200 }))
            : new Promise<Response>((r) => {
                complete = r;
                resolve();
              }),
      );
      (globalThis as any).testAuth = new ChatGPTAuth(
        store,
        vault,
        fetcher as any,
      );
    });
    const auth = (globalThis as any).testAuth as ChatGPTAuth;
    const refreshing = auth.accessToken();
    const assertion = expect(refreshing).rejects.toThrow();
    await started;
    await auth.logout();
    complete(
      Response.json({
        access_token: "too-late",
        refresh_token: "too-late",
        expires_in: 3600,
      }),
    );
    await assertion;
    expect(await vault.read("chatgpt")).toBeUndefined();
    delete (globalThis as any).testAuth;
  } finally {
    clean();
  }
});
