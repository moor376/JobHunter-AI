import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const srcDir = path.resolve(rootDir, "frontend/out");
const destDir = path.resolve(rootDir, "backend/public");

if (fs.existsSync(srcDir)) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.cpSync(srcDir, destDir, { recursive: true, force: true });
  console.log(`✓ Copied frontend build from ${srcDir} to ${destDir}`);
} else {
  console.warn(`! Frontend out directory not found at ${srcDir}. Run 'npm run build' in frontend first.`);
}
