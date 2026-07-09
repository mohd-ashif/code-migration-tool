import { migrateReactProjectToSvelte } from "./index";
import * as fs from "fs";
import * as path from "path";
import { ParsedFile } from "../../types/parser.types";

function main() {
  const args = process.argv.slice(2);
  const srcDir = args[0] || "/app/workspace/src";
  const destDir = args[1] || "/app/workspace/dest";

  const files: ParsedFile[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const relativePath = path.relative(srcDir, fullPath).replace(/\\/g, "/");
        const content = fs.readFileSync(fullPath, "utf8");
        files.push({ path: relativePath, content });
      }
    });
  }

  walk(srcDir);

  // Execute React -> Svelte Compiler
  const migrated = migrateReactProjectToSvelte(files);

  // Save outputs
  migrated.forEach((file) => {
    const fullPath = path.join(destDir, file.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, file.content, "utf8");
  });

  console.log("Migration pipeline successfully completed inside sandbox container.");
}

main();
