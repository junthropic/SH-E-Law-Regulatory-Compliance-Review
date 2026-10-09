import { parse } from "kordoc";
import AdmZip from "adm-zip";

// No filesystem extraction. Node permissions deny network, writes, child processes and addons.
process.once("message", async (encoded: string) => {
  let phase="parse";
  try {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > 20_000_000) throw Error();
    if (bytes.subarray(0, 2).toString() === "PK") {
      phase="archive_safety";
      const entries = new AdmZip(bytes).getEntries(), names = new Set<string>();
      if (entries.length > 2000) throw Error();
      let total = 0;
      for (const entry of entries) {
        const name = entry.entryName, normal = name.normalize("NFC").toLowerCase();
        if (!name || /[\\:\x00-\x1f]/.test(name) || name.startsWith("/") || name.split("/").some(p => p === ".." || p === "." || /[. ]$/.test(p)) || names.has(normal)) throw Error();
        names.add(normal);
        if ((entry.header.flags & 1) || ((entry.attr >>> 16) & 0xf000) === 0xa000 || entry.header.size > 25_000_000 || (total += entry.header.size) > 100_000_000 || entry.header.size / Math.max(1, entry.header.compressedSize) > 200) throw Error();
        if (entry.isDirectory) continue;
        const data = entry.getData(); // adm-zip validates CRC on decompression.
        if (data.length !== entry.header.size || data.subarray(0, 2).toString() === "PK" || /\.(zip|hwpx|docx|jar|7z|rar)$/i.test(name)) throw Error();
        if (/\.(xml|rels|hpf)$/i.test(name)) {
          // Reject UTF-16 and entity declarations instead of expanding external/internal entities.
          if (data.includes(0) || /<!DOCTYPE|<!ENTITY/i.test(data.toString("utf8"))) throw Error();
        }
      }
      if (!names.has("contents/content.hpf") || !names.has("mimetype")) throw Error();
    }
    phase="parse";
    const result = await parse(bytes, { ocr: false, scriptTags: true });
    // scriptTags retains mathematical superscript/subscript markup; it is not JS execution.
    if (!result.success || result.markdown.length > 1_500_000) throw Error();
    process.send?.({ success: true, markdown: result.markdown, resourcePermissions:{network:process.permission?.has("net"),fileWrite:process.permission?.has("fs.write"),childProcess:process.permission?.has("child"),addons:process.permission?.has("addons")}, warnings: (result.warnings || []).slice(0, 99).map(w => ({ message: String(w.message).slice(0, 5000) })) });
  } catch { process.send?.({ success: false, reason:phase }); }
});
