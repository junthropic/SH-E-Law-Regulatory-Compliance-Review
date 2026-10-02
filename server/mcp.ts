import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const allowed = new Set([
  "search_law",
  "search_ordinance",
  "get_ordinance",
  "get_law_text",
  "search_admin_rule",
  "get_admin_rule",
]);

/** Read-only allowlist. MCP summaries aid navigation; they never certify full legal text. */
export async function queryMcp(
  oc: string,
  toolName: string,
  params: Record<string, unknown> = {},
) {
  if (!oc || !allowed.has(toolName))
    throw new Error("허용된 읽기 도구와 법제처 OC가 필요합니다.");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(import.meta.resolve("korean-law-mcp"))],
    env: { LAW_OC: oc },
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => {});
  const client = new Client({ name: "sh-e-law-check", version: "0.1.0" });
  try {
    await client.connect(transport, { timeout: 15000 });
    const result = await client.callTool(
      { name: "execute_tool", arguments: { tool_name: toolName, params } },
      undefined,
      { timeout: 45000 },
    );
    if (result.isError)
      throw new Error("MCP 조회 실패. 공식 API 원문과 인증을 확인하세요.");
    return {
      tool: toolName,
      packageVersion: "4.15.5",
      note: "MCP 탐색 결과 — 전문·적용법 확인은 별도입니다.",
      content: result.content,
    };
  } finally {
    await client.close();
  }
}
