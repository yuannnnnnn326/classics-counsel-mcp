# 把这套 v1.0 文件应用到现有仓库

当前 ChatGPT 的 GitHub 连接只有读取权限，无法直接替你 push，所以这包文件已经按最终结构准备好。

建议按下面顺序更新：

1. 用本包 `README.md` 替换仓库根目录旧 README；
2. 用本包 `worker.js` 替换仓库根目录 `worker.js`；
3. 新增：
   - `SOURCES.md`
   - `CHANGELOG.md`
   - `.gitignore`
   - `docs/DEPLOY.md`
   - `docs/USAGE.md`
   - `docs/EXAMPLES.md`
   - `library/README.md`
4. 新建 `legacy/`：
   - `legacy/README.md`
   - `legacy/schema.sql`
5. 删除根目录旧 `schema.sql`（内容已经移到 legacy）；
6. `library/` 里现有十本 TXT 保持不动。

## 注意：新版 worker.js 部署到 Cloudflare 前

先在 Cloudflare Worker 的 Variables and Secrets 里加：

```text
GITHUB_OWNER   = 你的 GitHub 用户名
GITHUB_REPO    = classics-counsel-mcp
GITHUB_BRANCH  = main
LIBRARY_PATH   = library
```

`MCP_KEY` 继续保留为 Secret。

配置完这些变量之后，再把新版 `worker.js` 部署到 Cloudflare。

如果你暂时只想整理 GitHub 项目、不想动当前正在运行的插件，可以先只更新仓库文档，Cloudflare 继续跑现有稳定版本；等准备好环境变量以后再切换新版 worker。
