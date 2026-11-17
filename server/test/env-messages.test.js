import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function runEnvImport(envOverrides = {}) {
  const baseEnv = {
    ...process.env,
    ...envOverrides,
  };

  return spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(path.resolve(repoRoot, 'server', 'src', 'config', 'env.js')).href)})`], {
    cwd: repoRoot,
    env: baseEnv,
    encoding: 'utf8',
  });
}

function pathToFileURL(filePath) {
  return new URL(`file://${filePath.replace(/\\/g, '/')}`);
}

test('env config explains how to create the missing env file', () => {
  const result = runEnvImport({
    MONGODB_URI: '',
    JWT_SECRET: '',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /MONGODB_URI|JWT_SECRET/i);
  assert.match(result.stderr || result.stdout, /setup:env|server\/\.env/i);
});
