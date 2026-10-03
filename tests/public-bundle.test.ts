import { it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { testStore, evidence } from "./helpers.js";
import {
  writePublicBundle,
  readPublicBundle,
  parsePublicBundle,
} from "../server/public-bundle.js";
import { updatePublicBundle } from "../server/bundles.js";

const bundle = () => ({
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  evidence: [evidence({ verified: false })],
  sources: [],
});

it("공개 검사는 수집기가 마지막에 붙인 rawRef와 필드 순서 변경을 허용한다", () => {
  const data = bundle();
  data.evidence[0].rawRef = "a".repeat(64) + ".json";
  const reordered = Object.fromEntries(Object.entries(data).reverse());
  expect(parsePublicBundle(reordered)).toEqual(data);
});

it("필드 순서와 무관하게 공개 스키마 밖의 개인 필드는 거부한다", () => {
  const data = bundle();
  const invalid = {
    ...data,
    evidence: [{ ...data.evidence[0], privateNote: "TEST-PRIVATE" }],
  };
  expect(() => parsePublicBundle(invalid)).toThrow("스키마 외 필드");
});

it("압축 공개 번들은 한국어 원문·해시를 보존하고 기존 경로에서도 읽힌다", () => {
  const { store, clean } = testStore();
  try {
    const data = bundle(),
      path = join(store.dir, "bundle.json");
    writePublicBundle(path + ".gz", data);
    expect(readFileSync(path + ".gz").subarray(0, 2)).toEqual(
      Buffer.from([31, 139]),
    );
    expect(readPublicBundle(path)).toEqual(data);
    store.importPublic(path);
    expect(store.all<any>("evidence")[0].text).toBe(data.evidence[0].text);
    expect(store.all<any>("evidence")[0].hash).toBe(data.evidence[0].hash);
    expect(store.all("documents")).toHaveLength(0);
  } finally {
    clean();
  }
});

it("압축 다운로드도 스키마와 원문 해시를 검증하며 손상 시 기존 자료를 보존한다", async () => {
  const { store, clean } = testStore();
  try {
    const data = bundle();
    const fetcher = vi.fn(
      async (_url: string) =>
        new Response(new Uint8Array(gzipSync(JSON.stringify(data)))),
    );
    await updatePublicBundle(store, fetcher as any);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("bundle.json.gz");
    expect(store.all("evidence")).toHaveLength(1);
    data.evidence[0].hash = "0".repeat(64);
    await expect(updatePublicBundle(store, fetcher as any)).rejects.toThrow();
    await expect(
      updatePublicBundle(
        store,
        (async () => new Response("broken gzip")) as any,
      ),
    ).rejects.toThrow();
    expect(store.all("evidence")).toHaveLength(1);
  } finally {
    clean();
  }
});

it("압축 파일이 없는 구 저장소만 JSON으로 대체 조회한다", async () => {
  const { store, clean } = testStore();
  try {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith(".gz")
        ? new Response("", { status: 404 })
        : Response.json(bundle()),
    );
    await updatePublicBundle(store, fetcher as any);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async () => new Response("", { status: 500 }));
    await expect(updatePublicBundle(store, failing as any)).rejects.toThrow(
      "500",
    );
    expect(failing).toHaveBeenCalledTimes(1);
  } finally {
    clean();
  }
});

it("손상된 압축 파일은 빈 공개 번들로 간주하지 않는다", () => {
  const { store, clean } = testStore();
  try {
    const path = join(store.dir, "invalid.json.gz");
    writeFileSync(path, "not gzip");
    expect(() => store.importPublic(path)).toThrow();
    expect(store.all("evidence")).toHaveLength(0);
  } finally {
    clean();
  }
});
