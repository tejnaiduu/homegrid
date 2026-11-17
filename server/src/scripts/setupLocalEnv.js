import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, '../..');

function parseArgs() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const token = process.argv[index];
    if (!token.startsWith('--')) continue;
    const nextValue = process.argv[index + 1] && !process.argv[index + 1].startsWith('--')
      ? process.argv[index + 1]
      : undefined;
    args.set(token, nextValue);
    if (nextValue) index += 1;
  }
  return args;
}

const flags = parseArgs();
const targetDir = path.resolve(flags.get('--target') || serverRoot);
const examplePath = path.join(targetDir, '.env.example');
const targetPath = path.join(targetDir, '.env');

try {
  await fs.access(examplePath);
} catch (error) {
  throw new Error(`Missing example environment file at ${examplePath}. Ensure server/.env.example exists before running setup.`);
}

await fs.mkdir(targetDir, { recursive: true });
const targetExists = await fs.access(targetPath).then(() => true).catch(() => false);
if (targetExists && !flags.has('--force')) {
  console.log(`Existing environment file already exists at ${targetPath}. No changes were made.`);
  process.exit(0);
}

await fs.copyFile(examplePath, targetPath);
console.log(`Created environment file at ${targetPath} from ${examplePath}.`);
