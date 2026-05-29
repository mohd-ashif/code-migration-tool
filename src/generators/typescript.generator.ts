export function generateTypeScriptProject(files: Array<{ path: string; content: string }>) {
  return files.map((file) => ({ ...file, tsTransformed: true }));
}
