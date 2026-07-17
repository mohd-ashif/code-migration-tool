/**
 * Generates a valid standard-compliant PDF file from a title and text contents
 * without using any external library. Uses standard PDF Type 1 fonts (Courier / Courier-Bold).
 */
export function generateSimplePdf(title: string, summary: string): Buffer {
  // Escape special PDF characters: backslashes and parentheses
  const escapePdfText = (t: string) => {
    return t.replace(/[\\()]/g, "\\$&");
  };

  const lines = summary.split("\n");
  let streamContent = "BT\n/F1 10 Tf\n12 TL\n50 780 Td\n";

  // Render Title
  streamContent += `1.5 Tc\n/F2 16 Tf\n(${escapePdfText(title)}) Tj\nT*\n0 Tc\n/F1 10 Tf\n12 TL\n\n`;

  // Draw lines
  let lineCount = 0;
  for (const line of lines) {
    if (lineCount > 55) {
      // Simple guard against page overflow in single-page view
      streamContent += `(...[Truncated for PDF display limit]) Tj\nT*\n`;
      break;
    }
    const escaped = escapePdfText(line.trimEnd());
    streamContent += `(${escaped}) Tj T*\n`;
    lineCount++;
  }
  streamContent += "ET";

  const streamLength = Buffer.byteLength(streamContent, "utf8");

  // PDF Body structure
  const body = [
    `%PDF-1.4`,
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj`,
    `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`
  ];

  // Calculate byte offsets for xref
  let pdfString = "";
  const offsets: number[] = [];

  for (let i = 0; i < body.length; i++) {
    offsets.push(pdfString.length);
    pdfString += body[i] + "\n";
  }

  const xrefOffset = pdfString.length;
  let xref = `xref\n0 ${body.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < body.length; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }

  pdfString += xref;
  pdfString += `trailer\n<< /Size ${body.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdfString, "binary");
}
