// Converts every PDF in files/ to per-page PNGs at public/manual/<basename>-p<N>.png.
// Run: npm run pdf-to-png
import { pdf } from "pdf-to-img";
import { mkdir, readdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const FILES_DIR = path.join(ROOT, "files");
const OUT_DIR = path.join(ROOT, "public", "manual");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const entries = await readdir(FILES_DIR);
  const pdfs = entries.filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfs.length === 0) {
    console.log(`No PDFs found in ${FILES_DIR}`);
    return;
  }

  for (const file of pdfs) {
    const basename = path.basename(file, path.extname(file));
    const doc = await pdf(path.join(FILES_DIR, file), { scale: 2 });
    let n = 0;
    for await (const page of doc) {
      n += 1;
      const outPath = path.join(OUT_DIR, `${basename}-p${n}.png`);
      await writeFile(outPath, page);
    }
    console.log(`${file}: wrote ${n} page(s) -> public/manual/${basename}-pN.png`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
