import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.resolve(repoRoot, 'server');

function runSetup(targetDir) {
  const scriptPath = path.join(serverRoot, 'src', 'scripts', 'setupLocalEnv.js');
  return spawnSync(process.execPath, [scriptPath, '--target', targetDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('setupLocalEnv creates a local .env from the example when missing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homegrid-env-'));
  const targetDir = path.join(tempDir, 'server');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(path.join(serverRoot, '.env.example'), path.join(targetDir, '.env.example'));

  const result = runSetup(targetDir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const envContents = await fs.readFile(path.join(targetDir, '.env'), 'utf8');
  assert.match(envContents, /MONGODB_URI=/i);
  assert.match(envContents, /JWT_SECRET=/i);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('seedAdmin loads local .env values before creating the first admin', async () => {
  const envPath = path.join(serverRoot, '.env');
  const previousEnv = await fs.readFile(envPath, 'utf8').catch(() => null);
  const uniqueEmail = `seed-admin-${Date.now()}@example.com`;
  const uniquePhone = `9${String(Date.now()).slice(-9)}`;
  const tempEnv = [
    'NODE_ENV=development',
    'PORT=5000',
    'MONGODB_URI=mongodb://127.0.0.1:27017/electrical_material_platform',
    'JWT_SECRET=12345678901234567890123456789012',
    `ADMIN_NAME=Platform Admin`,
    `ADMIN_PHONE=${uniquePhone}`,
    `ADMIN_EMAIL=${uniqueEmail}`,
    'ADMIN_PASSWORD=StrongPassword123!',
    '',
  ].join('\n');

  try {
    await fs.writeFile(envPath, tempEnv);
    const result = spawnSync(process.execPath, [path.join(serverRoot, 'src', 'scripts', 'seedAdmin.js')], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout || result.stderr, /Admin created:|Admin role ensured/i);
  } finally {
    if (previousEnv === null) {
      await fs.rm(envPath, { force: true });
    } else {
      await fs.writeFile(envPath, previousEnv);
    }
  }
});
