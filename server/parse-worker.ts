import { parse } from "kordoc";
import AdmZip from "adm-zip";

process.once("message", async (encoded: string) => {
  try {
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.subarray(0, 2).toString() === "PK") {
      const entries = new AdmZip(buffer).getEntries();
      if (
        entries.length > 2000 ||
        entries.reduce((sum, e) => sum + e.header.size, 0) >
          100 * 1024 * 1024 ||
        entries.some(
          (e) => e.header.size > 25 * 1024 * 1024 || (e.header.flags & 1) !== 0,
        )
      )
        throw new Error("archive expansion limit");
    }
    const result = await parse(buffer, { ocr: false, scriptTags: true });
    if (!result.success) throw new Error("extraction failed");
    const warnings = (result.warnings || [])
      .slice(0, 99)
      .map((w) => ({ message: String(w.message).slice(0, 5000) }));
    if (result.markdown.length > 1_500_000)
      warnings.push({
        message:
          "문서가 너무 커 추출문이 잘렸습니다. 문서를 나누어 다시 올리세요.",
      });
    process.send?.({
      success: true,
      markdown: result.markdown.slice(0, 1_500_000),
      warnings,
    });
  } catch {
    process.send?.({ success: false });
  }
});
