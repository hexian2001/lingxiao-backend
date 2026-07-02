#!/usr/bin/env node
/**
 * Verify that @lingxiao-office/sdk and @lingxiao-office/web-api can be consumed like real
 * installed packages without reaching the network.
 *
 * Strategy:
 * 1. Run npm pack for each workspace package.
 * 2. Extract the generated tarballs into a temporary consumer project's
 *    node_modules/@lingxiao/* paths.
 * 3. Import by package name from the consumer project.
 *
 * This exercises package.json files/main/types/exports and dist payloads while
 * avoiding npm registry access and without polluting global npm installs.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const requireExtension = process.env.LINGXIAO_REQUIRE_WEB_API_EXTENSION !== '0';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  });
}

function log(message) {
  console.log(`[package-consumption] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function npmPack(packageDir, packDir) {
  const before = new Set(readdirSync(packDir));
  run('npm', ['pack', packageDir, '--pack-destination', packDir, '--silent']);
  const after = readdirSync(packDir).filter((name) => !before.has(name) && name.endsWith('.tgz'));
  assert(after.length === 1, `expected one tarball for ${packageDir}, got ${after.length}`);
  return path.join(packDir, after[0]);
}

function extractPackage(tarball, targetDir) {
  mkdirSync(path.dirname(targetDir), { recursive: true });
  const extractRoot = path.join(path.dirname(targetDir), `.extract-${path.basename(targetDir)}-${Date.now()}`);
  mkdirSync(extractRoot, { recursive: true });
  execFileSync('tar', ['-xzf', tarball, '-C', extractRoot], { stdio: 'pipe' });
  const packageRoot = path.join(extractRoot, 'package');
  assert(existsSync(packageRoot), `tarball ${tarball} did not contain package/ root`);
  rmSync(targetDir, { recursive: true, force: true });
  execFileSync('mv', [packageRoot, targetDir], { stdio: 'pipe' });
  rmSync(extractRoot, { recursive: true, force: true });
}

function validatePackagePayload(packageDir, expectedFiles) {
  const pkg = readJson(path.join(packageDir, 'package.json'));
  assert(pkg.type === 'module', `${pkg.name} should be ESM package`);
  for (const file of expectedFiles) {
    assert(existsSync(path.join(packageDir, file)), `${pkg.name} missing ${file} in packed payload`);
  }
  return pkg;
}

const tmpParent = path.join(repoRoot, '.tmp');
mkdirSync(tmpParent, { recursive: true });
const tmpRoot = mkdtempSync(path.join(tmpParent, 'lingxiao-package-consumption-'));
let failed = false;
try {
  log(`temp=${tmpRoot}`);
  log('building workspace packages');
  run('npm', ['run', 'build', '--workspace=@lingxiao-office/sdk'], { stdio: 'inherit' });
  run('npm', ['run', 'build', '--workspace=@lingxiao-office/web-api'], { stdio: 'inherit' });

  const packDir = path.join(tmpRoot, 'packs');
  mkdirSync(packDir, { recursive: true });
  const sdkTgz = npmPack('./packages/sdk', packDir);
  const webApiTgz = npmPack('./packages/web-api', packDir);
  log(`packed sdk=${path.basename(sdkTgz)}`);
  log(`packed web-api=${path.basename(webApiTgz)}`);

  const consumerDir = path.join(tmpRoot, 'consumer');
  const nodeModules = path.join(consumerDir, 'node_modules');
  mkdirSync(path.join(nodeModules, '@lingxiao-office'), { recursive: true });
  writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify({ type: 'module', private: true }, null, 2));

  const sdkInstallDir = path.join(nodeModules, '@lingxiao-office', 'sdk');
  const webApiInstallDir = path.join(nodeModules, '@lingxiao-office', 'web-api');
  extractPackage(sdkTgz, sdkInstallDir);
  extractPackage(webApiTgz, webApiInstallDir);

  const sdkPkg = validatePackagePayload(sdkInstallDir, ['dist/index.js', 'dist/index.d.ts']);
  const webApiPkg = validatePackagePayload(webApiInstallDir, ['dist/index.js', 'dist/index.d.ts', 'dist/server.js', 'dist/server.d.ts', 'dist/bin.js']);
  assert(webApiPkg.bin?.['lingxiao-web-api'] === 'dist/bin.js', '@lingxiao-office/web-api bin lingxiao-web-api should point to dist/bin.js');
  assert(existsSync(path.join(webApiInstallDir, webApiPkg.bin['lingxiao-web-api'])), '@lingxiao-office/web-api bin target missing');

  const smokeFile = path.join(consumerDir, 'smoke.mjs');
  writeFileSync(smokeFile, `
import { contentToPlainText, createAgentLoop, createLLMClient, createToolRegistry } from '@lingxiao-office/sdk';
import Fastify from 'fastify';
import * as webApi from '@lingxiao-office/web-api';
import * as webApiExtension from '@lingxiao-office/web-api/extension';

const failures = [];
function check(condition, message) { if (!condition) failures.push(message); }

check(typeof contentToPlainText === 'function', 'sdk.contentToPlainText export');
check(contentToPlainText([{ type: 'text', text: 'ok' }]) === 'ok', 'sdk.contentToPlainText behavior');
check(typeof createAgentLoop === 'function', 'sdk.createAgentLoop export');
check(typeof createLLMClient === 'function', 'sdk.createLLMClient export');
check(typeof createToolRegistry === 'function', 'sdk.createToolRegistry export');

check(typeof webApi.createServer === 'function', 'web-api.createServer export');
check(typeof webApi.createServerWithDeps === 'function', 'web-api.createServerWithDeps export');
check(typeof webApi.startServer === 'function', 'web-api.startServer export');

let extensionRouteStatus = 'not-required';
if (${JSON.stringify(requireExtension)}) {
  check(typeof webApi.WebApiRouteRegistry === 'function', 'web-api.WebApiRouteRegistry export');
  check(typeof webApi.defineWebApiExtension === 'function', 'web-api.defineWebApiExtension export');
  check(typeof webApiExtension.WebApiRouteRegistry === 'function', 'web-api/extension.WebApiRouteRegistry export');
  check(typeof webApiExtension.defineWebApiExtension === 'function', 'web-api/extension.defineWebApiExtension export');

  const fastify = Fastify({ logger: false });
  const registry = new webApiExtension.WebApiRouteRegistry([
    webApiExtension.defineWebApiExtension({
      name: 'package-consumption-smoke',
      register(context) {
        context.fastify.get('/__extension-smoke', async () => ({ ok: true, active: context.getActiveSessionId() ?? null }));
      },
    }),
  ]);
  await registry.registerAll({
    fastify,
    requireServerToken: () => true,
    sessionManager: {},
    repos: {},
    getActiveSessionId: () => 'smoke-session',
    connectionManager: {},
    eventEmitter: {},
  });
  const response = await fastify.inject({ method: 'GET', url: '/__extension-smoke' });
  check(response.statusCode === 200, 'web-api extension route status');
  check(response.json().ok === true, 'web-api extension route body');
  check(response.json().active === 'smoke-session', 'web-api extension context value');
  await fastify.close();
  extensionRouteStatus = String(response.statusCode);
}

if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  sdk: {
    contentToPlainText: typeof contentToPlainText,
    createAgentLoop: typeof createAgentLoop,
    createLLMClient: typeof createLLMClient,
    createToolRegistry: typeof createToolRegistry,
  },
  webApi: {
    createServer: typeof webApi.createServer,
    createServerWithDeps: typeof webApi.createServerWithDeps,
    startServer: typeof webApi.startServer,
    WebApiRouteRegistry: typeof webApi.WebApiRouteRegistry,
    defineWebApiExtension: typeof webApi.defineWebApiExtension,
    extensionSubpathRegistry: typeof webApiExtension.WebApiRouteRegistry,
    extensionRouteStatus,
  },
}, null, 2));
`);

  execFileSync(process.execPath, [smokeFile], {
    cwd: consumerDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Make dependency resolution deterministic for the manually extracted packages:
      // Node will also walk upward to repoRoot/node_modules because consumer lives under tmp,
      // but NODE_PATH helps tools that still consult it.
      NODE_PATH: path.join(repoRoot, 'node_modules'),
    },
  });

  const globalInstallNote = path.join(tmpRoot, 'global-install-note.txt');
  writeFileSync(globalInstallNote, [
    'Global install smoke is intentionally not executed by default to avoid mutating user npm globals.',
    `Manual check: npm install -g ${sdkTgz}`,
    `Manual check: npm install -g ${webApiTgz}`,
    'Then import/use package entrypoints or run lingxiao-web-api --help once a CLI help mode exists.',
  ].join('\n'));
  log('PASS');
} catch (error) {
  failed = true;
  console.error('[package-consumption] FAIL');
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  if (process.env.LINGXIAO_KEEP_PACKAGE_CONSUMPTION_TMP === '1' || failed) {
    log(`kept temp=${tmpRoot}`);
  } else {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}
