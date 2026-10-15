import { it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AI_LINK_TEXT, AiLinkStatus, startChatGpt } from "../beta/KeysPage.js";

// 2026-10-15 user design: "API 키 설정" ends with an "AI 연동" section that reuses the existing ChatGPT sign-in.
// Synthetic only: fetch is mocked and the window opener is a stub, so no OpenAI account, login or token is involved.
afterEach(() => vi.unstubAllGlobals());

it("V8-W05: AI 연동 상태는 연결 전 '아직 미연동된 상태입니다', 연결 후 '연동 완료'로 보인다", () => {
  expect(AI_LINK_TEXT).toEqual({ on: "연동 완료", off: "아직 미연동된 상태입니다" });
  const off = renderToStaticMarkup(createElement(AiLinkStatus, { connected: false }));
  const on = renderToStaticMarkup(createElement(AiLinkStatus, { connected: true }));
  expect(off).toContain("아직 미연동된 상태입니다");
  expect(off).not.toContain("연동 완료");
  expect(on).toContain("연동 완료");
  expect(on).not.toContain("미연동");
});

it("V8-W06: 'ChatGPT 연결하기'는 기존 로그인 시작 주소를 부르고, 받은 주소를 새 창(noopener)으로 연다", async () => {
  const signIn = "https://auth.openai.com/api/accounts/authorize?synthetic=1";
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: signIn }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const open = vi.fn();
  await startChatGpt(open);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe("/api/auth/chatgpt/start");
  expect(init.method).toBe("POST");
  expect(open).toHaveBeenCalledWith(signIn, "_blank", "noopener,noreferrer");
});

it("V8-W07: 로그인 시작이 거절되면 창을 열지 않고 서버 메시지를 그대로 넘긴다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "합성 거절" }), { status: 400 })));
  const open = vi.fn();
  await expect(startChatGpt(open)).rejects.toThrow("합성 거절");
  expect(open).not.toHaveBeenCalled();
});
