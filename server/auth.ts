import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify, customFetch } from "jose";
import { Vault } from "./vault.js";
import { Store } from "./store.js";

export type Account = {
  clientId: string;
  subject: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  idToken: string;
  scopes: string[];
  expiresAt: number;
  earliestRefreshAt?: number;
};
type Pending = {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
  account?: Account;
};
const issuer = "https://auth.openai.com";
const tokenUrl = issuer + "/api/accounts/oauth/token";
const resource = "https://api.openai.com/v1";
export function same(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function refreshTime(value: unknown) {
  if (value == null) return undefined;
  const n =
    typeof value === "number" ? value * 1000 : Date.parse(String(value));
  return Number.isFinite(n) ? n : undefined;
}
export class ChatGPTAuth {
  private pending?: Pending;
  private renewing?: Promise<Account>;
  private generation = 0;
  constructor(
    private store: Store,
    private vault: Vault,
    private fetcher: typeof fetch = fetch,
  ) {}
  async status() {
    const a = await this.vault.read<Account>("chatgpt");
    return {
      connected: !!a,
      email: a?.email || "",
      planAuthorized: !!a?.scopes.includes("chatgpt.tokens.use.direct"),
      expiresAt: a?.expiresAt || null,
      pending: !!this.pending,
    };
  }
  async start(origin: string) {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
      throw new Error("허용되지 않은 OAuth 회신 주소");
    this.generation++;
    const account = await this.vault.read<Account>("chatgpt");
    let hostId = this.store.setting("oauth-host-id", "");
    if (!hostId) {
      hostId = "urn:uuid:" + randomUUID();
      this.store.put("settings", "oauth-host-id", hostId);
    }
    const p: Pending = {
      state: randomBytes(32).toString("base64url"),
      nonce: randomBytes(32).toString("base64url"),
      verifier: randomBytes(48).toString("base64url"),
      redirectUri: origin + "/auth/callback",
      createdAt: Date.now(),
      account,
    };
    this.pending = p;
    const params: Record<string, string> = {
      client_id: account?.clientId || "dynamic_agent_client",
      ext_agent_host_id: hostId,
      response_type: "code",
      redirect_uri: p.redirectUri,
      scope:
        "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
      resource,
      state: p.state,
      nonce: p.nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256")
        .update(p.verifier)
        .digest("base64url"),
    };
    if (account) params.id_token_hint = account.idToken;
    else params.agent_name_hint = "SH-E-Law-Check";
    return {
      url: issuer + "/api/accounts/authorize?" + new URLSearchParams(params),
    };
  }
  cancel() {
    this.pending = undefined;
    this.generation++;
  }
  async callback(query: Record<string, string>) {
    const p = this.pending;
    if (
      !p ||
      Date.now() - p.createdAt > 10 * 60 * 1000 ||
      !same(query.state || "", p.state)
    )
      throw new Error("로그인 요청이 만료되었거나 state가 일치하지 않습니다.");
    this.pending = undefined;
    if (query.error)
      throw new Error("ChatGPT 연결이 취소되었거나 권한을 받지 못했습니다.");
    const clientId = query.client_id || p.account?.clientId;
    if (
      !clientId ||
      clientId === "dynamic_agent_client" ||
      (p.account && p.account.clientId !== clientId) ||
      !query.code
    )
      throw new Error("OAuth 클라이언트 또는 인증 코드 검증 실패");
    const generation = this.generation;
    const data = await this.exchange({
      grant_type: "authorization_code",
      client_id: clientId,
      code: query.code,
      code_verifier: p.verifier,
      redirect_uri: p.redirectUri,
      resource,
    });
    const config = (await this.fetcher(
      issuer + "/.well-known/openid-configuration",
      { signal: AbortSignal.timeout(15000) },
    ).then((r) => r.json())) as any;
    const jwksUrl = new URL(config.jwks_uri);
    if (jwksUrl.origin !== issuer) throw new Error("인증키 발급자 불일치");
    if (config.issuer !== issuer)
      throw new Error("인증 메타데이터 발급자 불일치");
    const { payload } = await jwtVerify(
      data.id_token,
      createRemoteJWKSet(jwksUrl, { [customFetch]: this.fetcher }),
      { issuer, audience: clientId },
    );
    if (
      payload.nonce !== p.nonce ||
      !payload.sub ||
      (p.account && payload.sub !== p.account.subject)
    )
      throw new Error("계정 또는 nonce 검증 실패");
    if (generation !== this.generation)
      throw new Error("로그인이 취소되었습니다.");
    const account: Account = {
      clientId,
      subject: payload.sub,
      email: String(payload.email || ""),
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scopes: String(data.scope || "").split(" "),
      expiresAt: Date.now() + Number(data.expires_in) * 1000,
      earliestRefreshAt: refreshTime(data.earliest_refresh_at),
    };
    await this.vault.write(
      "chatgpt",
      account,
      () => generation === this.generation,
    );
    if (generation !== this.generation)
      throw new Error("로그인이 취소되었습니다.");
    this.store.audit("oauth_connected", "계정 연결 성공");
  }
  private async exchange(params: Record<string, string>) {
    const r = await this.fetcher(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      throw new Error("ChatGPT 인증 실패 (" + r.status + "). 다시 연결하세요.");
    const d = (await r.json()) as any;
    if (!d.access_token || !Number.isFinite(Number(d.expires_in)))
      throw new Error("인증 응답 형식이 올바르지 않습니다.");
    return d;
  }
  async accessToken() {
    let a = await this.vault.read<Account>("chatgpt");
    if (!a) throw new Error("설정에서 ChatGPT를 연결하세요.");
    if (!a.scopes.includes("chatgpt.tokens.use.direct"))
      throw new Error(
        "ChatGPT 구독 사용 권한이 허용되지 않았습니다. 다시 연결하여 권한을 확인하세요.",
      );
    if (a.expiresAt < Date.now() + 60000) {
      if (a.earliestRefreshAt && Date.now() < a.earliestRefreshAt) {
        if (a.expiresAt > Date.now()) return a.accessToken;
        throw new Error("토큰 갱신 허용 시각 이후 다시 시도하세요.");
      }
      if (!this.renewing) {
        const old = a;
        const generation = this.generation;
        this.renewing = (async () => {
          if (!old.refreshToken)
            throw new Error("ChatGPT 재로그인이 필요합니다.");
          const d = await this.exchange({
            grant_type: "refresh_token",
            client_id: old.clientId,
            refresh_token: old.refreshToken,
            resource,
          });
          if (generation !== this.generation)
            throw new Error("연결이 해제되었습니다.");
          const updated = {
            ...old,
            accessToken: d.access_token,
            refreshToken: d.refresh_token || old.refreshToken,
            idToken: d.id_token || old.idToken,
            scopes: d.scope ? String(d.scope).split(" ") : old.scopes,
            earliestRefreshAt: refreshTime(d.earliest_refresh_at),
            expiresAt: Date.now() + Number(d.expires_in) * 1000,
          };
          await this.vault.write(
            "chatgpt",
            updated,
            () => generation === this.generation,
          );
          if (generation !== this.generation)
            throw new Error("연결이 해제되었습니다.");
          return updated;
        })().finally(() => {
          this.renewing = undefined;
        });
      }
      a = await this.renewing;
    }
    if (!a.scopes.includes("chatgpt.tokens.use.direct"))
      throw new Error(
        "갱신한 계정에 ChatGPT 구독 사용 권한이 없습니다. 다시 연결하세요.",
      );
    return a.accessToken;
  }
  async models() {
    const access = await this.accessToken();
    const r = await this.fetcher(resource + "/models", {
      headers: { Authorization: "Bearer " + access },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("모델 목록 조회 실패 (" + r.status + ")");
    const data = (await r.json()) as any;
    return (data.models || [])
      .filter((m: any) => m.visibility === "list")
      .map((m: any) => ({ id: m.slug, name: m.display_name }));
  }
  logout() {
    this.cancel();
    this.vault.remove("chatgpt");
    this.store.audit("oauth_disconnected", "로컬 연결 해제");
  }
}
