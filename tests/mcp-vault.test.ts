import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { testStore } from "./helpers.js";
import { Vault, VaultUnavailableError } from "../server/vault.js";
it("설치한 고정 버전 MCP 서버와 연결하고 도구 목록을 조회한다", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(import.meta.resolve("korean-law-mcp"))],
    env: { LAW_OC: "" },
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => {});
  const client = new Client({ name: "she-test", version: "0.1.0" });
  try {
    await client.connect(transport, { timeout: 10000 });
    const result = await client.listTools();
    expect(result.tools.some((t) => t.name === "execute_tool")).toBe(true);
  } finally {
    await client.close();
  }
}, 15000);
it.skipIf(process.platform !== "win32")(
  "Windows DPAPI로 보호한 시험 값을 숨김 프로세스에서 왕복 처리한다",
  async ({ skip }) => {
    const { store, clean } = testStore();
    try {
      const vault = new Vault(store.dir, false);
      try {
        await vault.write("test-secret", {
          sample: "TEST-ONLY-NOT-A-CREDENTIAL",
        });
      } catch (e) {
        if (e instanceof VaultUnavailableError) {
          expect(await vault.read("test-secret")).toBeUndefined();
          skip(
            "실행 환경에 DPAPI 사용자 프로필이 없어 실기기 왕복 시험 미실행",
          );
        }
        throw e;
      }
      expect(
        readFileSync(join(store.dir, "test-secret.dpapi"), "utf8"),
      ).not.toContain("TEST-ONLY");
      // A new instance must recover the persisted value, not an in-memory copy.
      expect(await new Vault(store.dir, false).read("test-secret")).toEqual({
        sample: "TEST-ONLY-NOT-A-CREDENTIAL",
      });
      vault.remove("test-secret");
      expect(await vault.read("test-secret")).toBeUndefined();
    } finally {
      clean();
    }
  },
  30000,
);
