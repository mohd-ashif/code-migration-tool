export function generateReactProject(files: Array<{ path: string; content: string }>) {
  return files.map((file) => ({ ...file, generatedAt: new Date().toISOString() }));
}
