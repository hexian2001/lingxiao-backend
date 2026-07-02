#!/usr/bin/env node
/**
 * NPM release helper for @lingxiao-office/sdk and @lingxiao-office/web-api.
 *
 * Usage:
 *   node scripts/release-npm.mjs preflight
 *   node scripts/release-npm.mjs dry-run
 *   CONFIRM_NPM_PUBLISH=1 node scripts/release-npm.mjs publish --otp=123456
 *
 * publish is intentionally gated by CONFIRM_NPM_PUBLISH=1 because npm publish
 * is externally visible and cannot be undone for the same version.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const registry = 'https://registry.npmjs.org/';
const mode = process.argv[2] ?? 'preflight';

// Parse --otp=XXXX from remaining args
const otpArg = process.argv.slice(3).find(a => a.startsWith('--otp='));
const otp = otpArg ? otpArg.split('=')[1] : (process.env.NPM_OTP || '');
const otpArgs = otp ? ['--otp', otp] : [];

const packages = [
  { workspace: '@lingxiao-office/sdk', dir: 'packages/sdk' },
  { workspace: '@lingxiao-office/web-api', dir: 'packages/web-api' },
];

function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, npm_config_registry: registry },
  });
}

function capture(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, npm_config_registry: registry },
    }).trim();
  } catch (error) {
    return String(error.stderr || error.stdout || error.message || error).trim();
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(`[release] ASSERT FAILED: ${message}`);
}

function validatePackageJson(pkgInfo) {
  const pkg = readJson(path.join(pkgInfo.dir, 'package.json'));
  assert(pkg.name === pkgInfo.workspace, `${pkgInfo.dir} name must be ${pkgInfo.workspace}`);
  assert(/^\d+\.\d+\.\d+/.test(pkg.version), `${pkg.name} version must be semver`);
  assert(pkg.type === 'module', `${pkg.name} must be ESM`);
  assert(pkg.main === 'dist/index.js', `${pkg.name} main must be dist/index.js`);
  assert(pkg.types === 'dist/index.d.ts', `${pkg.name} types must be dist/index.d.ts`);
  assert(pkg.files?.includes('dist'), `${pkg.name} files must include dist`);
  assert(pkg.publishConfig?.access === 'public', `${pkg.name} publishConfig.access must be public`);
  assert(pkg.publishConfig?.registry === registry, `${pkg.name} publishConfig.registry must be ${registry}`);
  console.log(`[release] package.json OK: ${pkg.name}@${pkg.version}`);
  return pkg;
}

function checkAuth() {
  const whoami = capture('npm', ['whoami', '--registry', registry]);
  if (/ENEEDAUTH|need auth|not logged in/i.test(whoami)) {
    console.warn('[release] npm auth: NOT LOGGED IN');
    console.warn('[release] Run: npm login --registry=https://registry.npmjs.org');
    return false;
  }
  console.log(`[release] npm auth: ${whoami}`);
  return true;
}

function checkRemote(pkgInfo) {
  const name = pkgInfo.workspace;
  const view = capture('npm', ['view', name, 'name', 'version', '--json', '--registry', registry]);
  if (/E404|Not Found/i.test(view)) {
    console.log(`[release] ${name}: not on registry yet (first publish expected)`);
    return null;
  }
  let parsed;
  try { parsed = JSON.parse(view); } catch { parsed = view; }
  console.log(`[release] ${name}: registry reports ${JSON.stringify(parsed)}`);
  return parsed;
}

function build() {
  console.log('[release] building...');
  run('npm', ['run', 'build']);
}

function verifyLayering() {
  console.log('[release] verifying layering...');
  run('node', ['scripts/verify-layering.mjs']);
}

function verifyConsumption() {
  console.log('[release] verifying package consumption...');
  run('npm', ['run', 'verify:package-consumption']);
}

function dryRunPack(pkgInfo) {
  console.log(`[release] dry-run pack: ${pkgInfo.workspace}`);
  const output = capture('npm', ['pack', `./${pkgInfo.dir}`, '--dry-run', '--json']);
  let manifest;
  try { manifest = JSON.parse(output); } catch { manifest = null; }
  if (manifest && Array.isArray(manifest)) {
    const entry = manifest[0];
    console.log(`[release] ${entry.name}@${entry.version} → ${entry.filename} (${entry.unpackedSize} bytes unpacked, ${entry.size} packed)`);
    const files = entry.files || [];
    console.log(`[release] ${files.length} files would be published`);
    const hasIndex = files.some(f => f.path === 'dist/index.js');
    const hasTypes = files.some(f => f.path === 'dist/index.d.ts');
    assert(hasIndex, `${pkgInfo.workspace} must include dist/index.js`);
    assert(hasTypes, `${pkgInfo.workspace} must include dist/index.d.ts`);
  } else {
    console.log(output.slice(0, 500));
  }
  console.log(`[release] dry-run pack OK: ${pkgInfo.workspace}`);
}

function npmPublish(pkgInfo) {
  const pkg = readJson(path.join(pkgInfo.dir, 'package.json'));

  // Check if this version already exists on registry
  const remote = checkRemote(pkgInfo);
  if (remote && typeof remote === 'object' && remote.version === pkg.version) {
    console.log(`[release] SKIP: ${pkgInfo.workspace}@${pkg.version} already published on registry`);
    return;
  }

  console.log(`[release] publishing ${pkgInfo.workspace}@${pkg.version} to ${registry}`);
  const args = ['publish', '--workspace', pkgInfo.workspace, '--access', 'public', '--registry', registry, ...otpArgs];
  if (otp) console.log(`[release] using OTP: ${otp[0]}***`);
  run('npm', args);
  console.log(`[release] published: ${pkgInfo.workspace}@${pkg.version}`);
}

function preflight() {
  console.log('========== NPM RELEASE PREFLIGHT ==========');
  console.log(`[release] mode=preflight  registry=${registry}\n`);

  for (const pkgInfo of packages) {
    validatePackageJson(pkgInfo);
    checkRemote(pkgInfo);
  }
  console.log();
  build();
  verifyLayering();
  verifyConsumption();
  for (const pkgInfo of packages) dryRunPack(pkgInfo);

  console.log('\n========== PREFLIGHT SUMMARY ==========');
  const authed = checkAuth();
  if (!authed) {
    console.log('[release] auth not ready — publish will require login first.');
  }
  console.log('[release] preflight complete. Next: npm login (if needed), then dry-run / publish.');
}

function dryRun() {
  console.log('========== NPM RELEASE DRY-RUN ==========');
  for (const pkgInfo of packages) validatePackageJson(pkgInfo);
  build();
  for (const pkgInfo of packages) dryRunPack(pkgInfo);
  console.log('\n[release] dry-run complete. To publish: CONFIRM_NPM_PUBLISH=1 node scripts/release-npm.mjs publish');
}

function publish() {
  console.log('========== NPM RELEASE PUBLISH ==========');
  if (process.env.CONFIRM_NPM_PUBLISH !== '1') {
    throw new Error('[release] Set CONFIRM_NPM_PUBLISH=1 to publish. npm publish is irreversible per version.');
  }
  for (const pkgInfo of packages) validatePackageJson(pkgInfo);
  const authed = checkAuth();
  if (!authed) throw new Error('[release] Not logged in. Run: npm login --registry=https://registry.npmjs.org');
  if (!otp) {
    console.warn('[release] WARNING: No OTP provided. If 2FA is enabled, publish will fail.');
    console.warn('[release] Pass --otp=YOUR_CODE or set NPM_OTP env var.');
  }
  build();
  verifyConsumption();

  // Publish SDK first, then web-api (web-api depends on sdk).
  for (const pkgInfo of packages) {
    npmPublish(pkgInfo);
  }
  console.log('\n========== PUBLISH COMPLETE ==========');
  for (const pkgInfo of packages) {
    checkRemote(pkgInfo);
  }
}

const modes = { preflight, 'dry-run': dryRun, publish };
const fn = modes[mode];
if (!fn) {
  console.error(`[release] Unknown mode "${mode}". Use: preflight | dry-run | publish`);
  process.exit(1);
}
fn();
