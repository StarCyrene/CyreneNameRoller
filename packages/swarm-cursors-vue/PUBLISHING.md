# 发布 swarm-cursors-vue

包名是 `swarm-cursors-vue`，源码在 `Cyrene2008/swarm-cursors-vue`。GitHub 上可安装的源码提交、npm 待审版本和公开 npm 版本是三种不同的状态。

## 第一次发布与身份绑定

1. 用维护者的 npm 账号在本机登录。在干净的正式提交运行 `bun install --frozen-lockfile`、`bun run build`、`bun run test`。使用 npm 11.21.3 或兼容的较新版本执行 `npm pack`，再用 `npm stage publish ./swarm-cursors-vue-<版本>.tgz --access public --registry=https://registry.npmjs.org/` 将同一份 tarball 送审。新包名会出现在注册表中，初始占位版本是 `0.0.0-stage`；这不表示实际版本已经可以安装。
2. 登录 npm，进入包的 **Settings → Trusted publishing → GitHub Actions**。GitHub 组织/用户填 `Cyrene2008`，仓库填 `swarm-cursors-vue`，workflow 文件名填 `publish.yml`（不是完整路径），Environment 留空。选择仅允许 **npm stage publish**；无需给工作流直接发布或修改 dist-tag 的额外权限，也无需创建 GitHub 的 `NPM_TOKEN` secret。
3. 在 npm 的待审列表核对包名、版本、来源和文件。确认后由维护者在 npm 网页用自己的 2FA 或 passkey 批准；也可运行 `npm stage list swarm-cursors-vue` 和 `npm stage approve <stage-id>`。不要在聊天或仓库里粘贴验证码和 token。首次从本地提交的版本没有 GitHub Actions 构建来源证明；后续由下面的 OIDC 工作流生成。

## 后续发布

- 更新 `package.json`、插件导出的版本及 CHANGELOG，构建并提交 dist。向 `main` 推送或提 PR 时，工作流只构建、测试、打包并检查内容，不送审。
- 在通过检查的提交创建与包版本相同的 tag，例如版本 1.4.1 使用 `v1.4.1`。推送该 tag 后，GitHub 托管的 Linux runner 将已验证的 tarball 用 OIDC 送审，并请求生成 provenance。若同一版本已在本机送审，不再为它重复送审。手动运行同一工作流时也必须选版本 tag 才会送审。
- 审核通过后检查 `npm view swarm-cursors-vue@<版本> version dist.integrity --registry=https://registry.npmjs.org/`；预期版本可查询后再告知用户通过 npm 安装。

[npm 官方：Trusted publishing](https://docs.npmjs.com/trusted-publishers/) · [npm 官方：Staged publishing](https://docs.npmjs.com/staged-publishing/)
