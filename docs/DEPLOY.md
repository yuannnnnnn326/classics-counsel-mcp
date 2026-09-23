# 部署指南

这份指南以“GitHub 存典籍 TXT + Cloudflare Worker 提供 MCP + ChatGPT 自定义 App 调用”为主。

> 产品界面会变化；如果你看到的按钮名称略有不同，以当前 Cloudflare / ChatGPT 实际界面为准。

---

## 一、准备 GitHub 仓库

Fork 或复制本项目，然后确认至少有：

```text
worker.js
library/
```

向 `library/` 上传一个 UTF-8 TXT，例如：

```text
library/史記.txt
```

v1.0 默认按公开 GitHub 仓库读取。私有仓库认证不在当前版本范围内。

---

## 二、创建 Cloudflare Worker

在 Cloudflare Dashboard：

1. 进入 **Workers & Pages**；
2. 创建一个 Worker；
3. 进入 Worker 后打开 **Edit code**；
4. 用本仓库的 `worker.js` 替换默认代码；
5. 先不要把任何密钥写进源码。

---

## 三、配置 Variables and Secrets

进入 Worker：

**Settings → Variables and Secrets**

添加以下普通环境变量：

```text
GITHUB_OWNER   你的 GitHub 用户名
GITHUB_REPO    你的仓库名
GITHUB_BRANCH  main
LIBRARY_PATH   library
```

其中：

- `GITHUB_OWNER` 必填；
- `GITHUB_REPO` 必填；
- `GITHUB_BRANCH` 可省略，默认 `main`；
- `LIBRARY_PATH` 可省略，默认 `library`。

再新增一个 **Secret**：

```text
MCP_KEY
```

值请使用随机、足够长、不可猜测的字符串。

不要把 `MCP_KEY` 提交到 GitHub。

配置完成后 Deploy。

---

## 四、检查 Worker 是否正常

部署后访问：

```text
https://<YOUR-WORKER>.<YOUR-SUBDOMAIN>.workers.dev/health
```

正常应看到类似：

```json
{
  "ok": true,
  "service": "classics-counsel-mcp",
  "version": "1.0.0",
  "source": "github-txt-library",
  "github_configured": true
}
```

如果 `github_configured` 是 `false`，检查 `GITHUB_OWNER` 和 `GITHUB_REPO`。

---

## 五、在 ChatGPT 创建自定义 App

如果你的 ChatGPT 账号 / 工作区提供 Developer Mode 或创建自定义 MCP App 的入口：

1. 打开 ChatGPT 设置；
2. 进入 **Apps**；
3. 启用 Developer Mode（如果当前账号需要）；
4. 创建新的自定义 App；
5. MCP Endpoint 填：

```text
https://<YOUR-WORKER>.<YOUR-SUBDOMAIN>.workers.dev/mcp/<YOUR_MCP_KEY>
```

6. 当前 Worker 不额外使用 OAuth，可选择与你界面匹配的无认证方式；
7. 扫描 / Scan Tools；
8. 确认看到：
   - `list_books`
   - `get_book_info`
   - `search_passages`
   - `get_passage`
9. 创建 App。

你可以把 App 命名成“典籍参谋”“内阁”或任何你喜欢的名字。

如果之后修改了工具 schema / description，需要回 App 设置里刷新工具。

---

## 六、开始测试

先测试书目：

> `@典籍参谋 看看我的典籍库里有哪些书。`

再测试单书：

> `@典籍参谋 在《史记》里搜“鸿门”。`

最后测试全库：

> `@典籍参谋 从现有所有典籍里找“用人无疑与防人之心”两个不同方向的例子。`

如果全库测试正常，回答应当能确认所有当前 TXT 都参加了检索，再从中挑不同方向的案例。

---

## 七、以后新增书

以后只需要：

```text
上传 library/新書.txt
```

不需要：

- 改 `worker.js`；
- 手工切 Markdown；
- 手工写 passage ID；
- 导入 D1。

目录列表可能缓存约 60 秒。

---

## 八、当前架构里不再需要 D1

旧版项目曾把典籍切成 passages 存到 D1。v1.0 已经改为直接读取 GitHub TXT。

如果你的 Cloudflare Worker 还保留一个旧 D1 binding，它不会影响当前代码，但已经不是必需项，可以在确认 v1.0 稳定后再自行移除。

---

## 九、官方文档

OpenAI：Developer mode and MCP apps in ChatGPT  
https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

Cloudflare：Environment variables  
https://developers.cloudflare.com/workers/configuration/environment-variables/

Cloudflare：Secrets  
https://developers.cloudflare.com/workers/configuration/secrets/

Cloudflare：Dashboard Workers getting started  
https://developers.cloudflare.com/workers/get-started/dashboard/
