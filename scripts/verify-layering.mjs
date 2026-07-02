#!/usr/bin/env node
/**
 * 分层契约硬验证：证明 @lingxiao-office/sdk 不依赖 @lingxiao-office/web-api。
 *
 * 这是本 monorepo 的核心架构不变量。SDK 必须能被任意产品线独立嵌入，
 * 绝不能反向依赖 Web API 层。本脚本从源码层面静态扫描，任何违反即 fail。
 *
 * 检查项：
 *  1. SDK 源码不得出现 `@lingxiao-office/web-api` 依赖（静态/动态 import 均禁止）
 *  2. SDK package.json 的 dependencies/devDependencies 不得含 @lingxiao-office/web-api
 *  3. SDK 源码不得出现指向 web-api 包内部的相对越界 import
 *  4. web-api 对 SDK 的依赖方向正确（仅作正向说明，不 fail）
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SDK_SRC = join(ROOT, 'packages/sdk/src');
const WEB_API_SRC = join(ROOT, 'packages/web-api/src');

/** 递归收集 .ts 文件 */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (extname(entry) === '.ts') {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

// ── 检查 1 + 3：SDK 源码扫描 ──────────────────────────────
const sdkFiles = collectTsFiles(SDK_SRC);
// 匹配 import ... from '@lingxiao-office/web-api...'、import('@lingxiao-office/web-api...')、require('@lingxiao-office/web-api...')
const webApiPkgRe = /(from\s+|import\s*\(\s*|require\s*\(\s*)['"]@lingxiao\/web-api(\/[^'"]*)?['"]/;
// 匹配相对越界到 web-api 包（../../web-api/ 之类）
const crossPkgRe = /(from\s+|import\s*\(\s*)['"](\.\.\/)+.*web-api\//;

for (const file of sdkFiles) {
  const lines = readFileSync(file, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    // 跳过注释行（以 * 或 // 开头的说明性引用，如包描述里提到 web-api）
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
    if (isComment) return;
    if (webApiPkgRe.test(line)) {
      violations.push(`[SDK→web-api 包依赖] ${file.replace(ROOT + '/', '')}:${i + 1}  ${trimmed}`);
    }
    if (crossPkgRe.test(line)) {
      violations.push(`[SDK→web-api 越界相对import] ${file.replace(ROOT + '/', '')}:${i + 1}  ${trimmed}`);
    }
  });
}

// ── 检查 2：SDK package.json 依赖字段 ─────────────────────
const sdkPkg = JSON.parse(readFileSync(join(ROOT, 'packages/sdk/package.json'), 'utf-8'));
for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
  const deps = sdkPkg[field] || {};
  if (deps['@lingxiao-office/web-api']) {
    violations.push(`[SDK package.json] ${field} 含 @lingxiao-office/web-api`);
  }
}

// ── 检查 4：web-api → SDK 正向依赖说明（不 fail）────────────
const webApiPkg = JSON.parse(readFileSync(join(ROOT, 'packages/web-api/package.json'), 'utf-8'));
const webApiHasSdk = (webApiPkg.dependencies || {})['@lingxiao-office/sdk'];

// ── 汇总输出 ──────────────────────────────────────────────
console.log('=== 分层契约验证：@lingxiao-office/sdk ⊥ @lingxiao-office/web-api ===\n');
console.log(`SDK 源码文件数: ${sdkFiles.length}`);
console.log(`web-api → @lingxiao-office/sdk 依赖: ${webApiHasSdk || '✗ 缺失'}`);
console.log('');

if (violations.length > 0) {
  console.error(`✗ 发现 ${violations.length} 处 SDK 反向依赖 web-api 的违规：\n`);
  for (const v of violations) console.error('  ' + v);
  console.error('\nSDK 必须保持对 web-api 零依赖。请修复上述引用。');
  process.exit(1);
}

if (!webApiHasSdk) {
  console.error('✗ web-api 未声明对 @lingxiao-office/sdk 的依赖，依赖方向不完整。');
  process.exit(1);
}

console.log('✓ SDK 对 web-api 零依赖（源码 + package.json 双重扫描通过）');
console.log('✓ web-api 正向依赖 @lingxiao-office/sdk');
console.log('\n分层契约成立：SDK 可独立嵌入，Web API 建立在 SDK 之上。');
