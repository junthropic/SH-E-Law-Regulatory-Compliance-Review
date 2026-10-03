import { it, expect, vi } from "vitest";
import AdmZip from "adm-zip";
import { PetitionCollector, type PetitionConfig } from "../server/petitions.js";
import { Vault } from "../server/vault.js";
import { testStore } from "./helpers.js";
import { ingestDocument } from "../server/documents.js";
const config: PetitionConfig = {
  permissionReference: "TEST-ONLY-NOT-REAL-PERMISSION",
  approvedBy: "가상 운영기관",
  permissionExpiresAt: "2099-01-01T00:00:00.000Z",
  permittedScope: "own",
  loginUrl: "https://www.epeople.go.kr/test-login",
  listUrl: "https://www.epeople.go.kr/test-list",
  selectorVersion: "fixture-1",
  selectorsVerifiedAt: new Date().toISOString(),
  selectors: {
    loggedIn: ".fixture",
    items: ".fixture",
    next: ".fixture",
    title: ".fixture",
    question: ".fixture",
    answer: ".fixture",
    agency: ".fixture",
    responseDate: ".fixture",
  },
  maxPages: 1,
  delayMs: 2000,
};
it("승낙 정보 없이는 브라우저를 열지 않는다", async () => {
  const { store, clean } = testStore();
  try {
    const driver = { open: vi.fn(), close: vi.fn() } as any;
    const collector = new PetitionCollector(
      store,
      new Vault(store.dir, true),
      driver,
    );
    await expect(collector.start({})).rejects.toThrow();
    await expect(
      collector.start({
        ...config,
        permissionExpiresAt: "2000-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("만료");
    expect(driver.open).not.toHaveBeenCalled();
  } finally {
    clean();
  }
});
it("승인 범위·로그인 확인 후 fixture 회신을 로컬 문서로만 저장", async () => {
  const { store, clean } = testStore();
  try {
    const driver = {
      open: vi.fn(),
      loggedIn: vi.fn(async () => true),
      items: vi.fn(async () => [
        {
          title: "시험 회신",
          question: "가상 질의",
          answer: "가상 회신입니다. 실제 해석이 아닙니다.",
          agency: "시험기관",
          responseDate: "2026-10-01",
          url: "https://www.epeople.go.kr/test-case",
        },
      ]),
      next: vi.fn(async () => false),
      state: vi.fn(async () => ({ fixture: true })),
      close: vi.fn(),
    };
    const collector = new PetitionCollector(
      store,
      new Vault(store.dir, true),
      driver,
    );
    await collector.start(config);
    expect((await collector.collect()).imported).toBe(1);
    expect(store.all("evidence")).toHaveLength(0);
    expect(store.all<any>("documents")[0].confirmed).toBe(false);
    expect(driver.close).toHaveBeenCalled();
    expect(driver.next).not.toHaveBeenCalled();
  } finally {
    clean();
  }
});
it("민원 연결 해제 뒤 지연된 응답은 문서나 세션을 복구하지 않는다", async () => {
  const { store, clean } = testStore();
  try {
    const vault = new Vault(store.dir, true);
    let release!: (rows: any[]) => void;
    const driver = {
      open: vi.fn(),
      loggedIn: vi.fn(async () => true),
      items: vi.fn(
        () =>
          new Promise<any[]>((resolve) => {
            release = resolve;
          }),
      ),
      next: vi.fn(),
      state: vi.fn(),
      close: vi.fn(),
    };
    const collector = new PetitionCollector(store, vault, driver);
    await collector.start(config);
    const pending = collector.collect();
    const rejected = expect(pending).rejects.toThrow("해제");
    await vi.waitFor(() => expect(driver.items).toHaveBeenCalled());
    await expect(collector.collect()).rejects.toThrow("이미");
    await collector.close();
    release([]);
    await rejected;
    expect(await vault.read("epeople-session")).toBeUndefined();
    expect(store.all("documents")).toHaveLength(0);
  } finally {
    clean();
  }
});
it("손상된 문서는 추출 프로세스만 실패하고 다른 업로드는 정상 처리한다", async () => {
  const { store, clean } = testStore();
  try {
    await expect(
      ingestDocument(
        store,
        "broken.pdf",
        Buffer.from("%PDF-1.7 broken fixture"),
      ),
    ).rejects.toThrow("추출 실패");
    expect(
      (await ingestDocument(store, "valid.txt", Buffer.from("정상 문서"))).text,
    ).toBe("정상 문서");
    expect(store.all("documents")).toHaveLength(1);
  } finally {
    clean();
  }
  // Two isolated workers each have a 30-second deadline; Windows CI cold starts
  // must not be cut off by Vitest's default five-second deadline.
}, 65000);
it("TXT 파일을 중복 없이 보관하고 미확인 추출문으로 표시한다", async () => {
  const { store, clean } = testStore();
  try {
    const a = await ingestDocument(
      store,
      "회신.txt",
      Buffer.from("시험용 회신 내용 100 L"),
    );
    const b = await ingestDocument(
      store,
      "다른이름.txt",
      Buffer.from("시험용 회신 내용 100 L"),
    );
    expect(a.id).toBe(b.id);
    expect(a.confirmed).toBe(false);
    expect(a.text).toContain("100 L");
    await expect(
      ingestDocument(store, "bad.exe", Buffer.from("x")),
    ).rejects.toThrow();
  } finally {
    clean();
  }
});
it("DOCX에서 한국어와 수량을 추출한다", async () => {
  const { store, clean } = testStore();
  try {
    const zip = new AdmZip();
    zip.addFile(
      "[Content_Types].xml",
      Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    );
    zip.addFile(
      "_rels/.rels",
      Buffer.from(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
    );
    zip.addFile(
      "word/document.xml",
      Buffer.from(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>시험 물질 최대 500 L</w:t></w:r></w:p></w:body></w:document>',
      ),
    );
    const doc = await ingestDocument(store, "시험.docx", zip.toBuffer());
    expect(doc.text).toContain("500 L");
    expect(doc.text).toContain("시험 물질");
  } finally {
    clean();
  }
});
