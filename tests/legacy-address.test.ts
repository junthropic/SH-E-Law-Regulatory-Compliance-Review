import { expect, it } from "vitest";
import { createLegacyRedirect } from "../server/legacy-address.js";

it("이전 주소는 실제 설정으로 이동하며 요청의 쿼리나 인증값을 전달하지 않는다", async () => {
  const app = createLegacyRedirect();
  try {
    const headers = { host: "127.0.0.1:4327" };
    const page = await app.inject({ url: "/?serviceKey=synthetic", headers });
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe("http://127.0.0.1:4317/#settings");
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(page.body).not.toContain("synthetic");
    for (const method of ["GET", "POST"] as const) {
      const blocked = await app.inject({
        method,
        url: "/api/public-apis/grievance/key",
        headers,
        ...(method === "POST" ? { payload: { key: "synthetic" } } : {}),
      });
      expect(blocked.statusCode).toBe(410);
      expect(blocked.headers.location).toBeUndefined();
      expect(blocked.body).not.toContain("synthetic");
    }
    expect(
      (await app.inject({ url: "/", headers: { host: "untrusted.example" } }))
        .statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
