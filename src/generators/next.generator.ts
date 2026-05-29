export function generateNextProject(files: Array<{ path: string; content: string }>) {
  return files.map((file) => ({ ...file, nextReady: true }));
}
