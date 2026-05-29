import { ParsedFile } from "../types/parser.types";
import unzipper from "unzipper";

export async function extractZip(buffer: Buffer): Promise<ParsedFile[]> {
  const directory = await unzipper.Open.buffer(buffer);
  const files: ParsedFile[] = [];

  await Promise.all(
    directory.files.map(async (entry: any) => {
      if (entry.type !== "File") return;
      const contentBuffer = await entry.buffer();
      files.push({
        path: entry.path,
        content: contentBuffer.toString("utf8"),
      });
    })
  );

  return files;
}
