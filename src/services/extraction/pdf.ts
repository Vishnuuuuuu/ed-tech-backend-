import { readFile } from "node:fs/promises";
// Node-friendly build of pdf.js (no DOM/worker required).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export class ImageOnlyPdfError extends Error {
  constructor(message = "PDF appears to be image-only (no extractable text). OCR is out of scope for v1.") {
    super(message);
    this.name = "ImageOnlyPdfError";
  }
}

/** Extract plain text from PDF bytes. Throws ImageOnlyPdfError if near-empty. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }
  await doc.destroy();

  const text = pages.join("\n").replace(/[ \t]+/g, " ").trim();

  // Image-only / scanned PDFs yield essentially no text — reject, don't OCR.
  if (text.replace(/\s/g, "").length < 40) {
    throw new ImageOnlyPdfError();
  }
  return text;
}

export async function extractPdfTextFromPath(path: string): Promise<string> {
  const buf = await readFile(path);
  return extractPdfText(new Uint8Array(buf));
}
