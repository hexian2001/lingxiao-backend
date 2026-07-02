# NPM 发布指南

本指南说明如何把 `@lingxiao-office/sdk` 和 `@lingxiao-office/web-api` 发布到 npm registry，让外部开发者通过 `npm install` 直接安装使用。

## 前置条件

1. **npm 账号**：到 [npmjs.com](https://www.npmjs.com/signup) 注册账号。
2. **组织**：在 npm 创建组织 `lingxiao-office`（Settings → Organizations → Create Organization，选免费方案即可）。
3. **Node >= 24**：本地 Node 版本满足 `engines.node` 要求。
4. **已构建**：`npm run build` 通过，产物在 `dist/`。

## 发布流程

### 第一步：登录 npm

```bash
npm login --registry=https://registry.npmjs.org
```

按提示输入用户名、密码、邮箱和 2FA 验证码。如果启用了 2FA，确保有 OTP 可用。

验证登录：

```bash
npm whoami --registry=https://registry.npmjs.org
```

输出你的 npm 用户名即成功。

### 第二步：预检（preflight）

```bash
npm run release:preflight
```

预检会：

1. 校验两个包的 `package.json`（name、version、type、main、types、files、publishConfig）。
2. 查询 npm registry 确认包名未被占用或已有版本。
3. 构建 SDK 和 Web API。
4. 运行分层验证（SDK 不依赖 Web API）。
5. 运行 package consumption smoke（打包后按真实包名导入验证）。
6. 对两个包执行 `npm pack --dry-run`，列出将要发布的文件清单和体积。
7. 检查 npm 登录状态。

预检全绿后可以继续。

### 第三步：dry-run 发布

```bash
npm run release:dry-run
```

dry-run 会构建并对两个包执行 `npm pack --dry-run`，确认实际 tarball 内容正确，但不会上传到 registry。

### 第四步：正式发布

```bash
CONFIRM_NPM_PUBLISH=1 node scripts/release-npm.mjs publish --otp=你的验证码
```

> 如果 npm 账号开启了 2FA（双因素认证），必须传 `--otp=验证码` 或设置环境变量 `export NPM_OTP=验证码`。
> 验证码每 30 秒变化，请从你的 authenticator app 获取当前有效值。

正式发布会：

1. 重新校验 `package.json`。
2. 检查 npm 登录状态（未登录会报错终止）。
3. 构建并跑 consumption smoke。
4. 先发布 `@lingxiao-office/sdk`，再发布 `@lingxiao-office/web-api`（web-api 依赖 sdk，顺序不能反）。
5. 发布后查询 registry 确认包已上线。

> `CONFIRM_NPM_PUBLISH=1` 是安全门禁。npm publish 同版本号不可撤销，必须显式确认。

### 第五步：验证安装

发布成功后，在一个全新目录验证：

```bash
mkdir /tmp/test-install && cd /tmp/test-install
npm init -y
npm install @lingxiao-office/sdk @lingxiao-office/web-api
node -e "import('@lingxiao-office/sdk').then(m => console.log(Object.keys(m)))"
```

## 发布顺序

```
@lingxiao-office/sdk  （先发布，无内部依赖）
        ↓
@lingxiao-office/web-api  （后发布，依赖 sdk）
```

`web-api` 的 `dependencies` 写的是 `"@lingxiao-office/sdk": "*"`，所以 sdk 必须先上线。

## 版本管理

发布新版本时：

1. 修改 `packages/sdk/package.json` 和 `packages/web-api/package.json` 的 `version` 字段。
2. 建议两个包同步升版本，保持一致。
3. 跑 `npm run release:preflight` 确认。
4. `CONFIRM_NPM_PUBLISH=1 node scripts/release-npm.mjs publish`。

> npm 不允许重复发布相同版本号。如果发布后发现 bug，必须升 patch 版本后重新发布。

## 常见问题

### E403 Forbidden / no access

- 确认你已加入 npm 组织 `lingxiao-office` 且角色为 Owner 或 Developer。
- 确认包名 scope 正确：`@lingxiao-office/sdk`，不是 `@lingxiao/sdk`。

### ENEEDAUTH

- 运行 `npm login --registry=https://registry.npmjs.org` 重新登录。
- 如果 registry 配了镜像（如 npmmirror），需要加 `--registry` 强制走官方 registry。

### one-time passcode required

- npm 账号开启了 2FA。发布时如果报 OTP 错误，运行：
  ```bash
  npm publish --workspace=@lingxiao-office/sdk --access public --registry=https://registry.npmjs.org --otp=你的验证码
  ```
- 或在 npm 账号设置中把发布策略从 "auth and writes" 改为 "auth only"。

### 包名已被占用

- 查询：`npm view @lingxiao-office/sdk --registry=https://registry.npmjs.org`
- 如果 404 说明没人用；如果返回版本号说明你的组织已发过。

## 发布脚本说明

| 命令 | 作用 |
| --- | --- |
| `npm run release:preflight` | 完整预检：校验 + 构建 + 分层 + consumption smoke + dry-run pack + auth 检查 |
| `npm run release:dry-run` | 轻量 dry-run：构建 + npm pack --dry-run |
| `CONFIRM_NPM_PUBLISH=1 node scripts/release-npm.mjs publish --otp=CODE` | 正式发布（需登录 + 确认环境变量 + OTP） |

脚本位置：`scripts/release-npm.mjs`
