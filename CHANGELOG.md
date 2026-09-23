# Changelog

## v1.0.0

### Changed

- 从“D1 + 人工切分 passages”迁移到“GitHub `library/*.txt` 动态典籍库”；
- 新增典籍不再需要修改核心代码；
- `list_books` 动态读取当前 TXT；
- `search_passages` 支持全库覆盖统计；
- 全库搜索时每本命中的典籍都保留代表结果，避免前几本高命中书挤掉后续书；
- `get_passage` 使用稳定的 `passage_ref` 展开上下文；
- GitHub owner / repo / branch / library path 改为 Cloudflare 环境变量配置；
- 增加面向现实困惑的 MCP 行为说明：优先找具体原文、不同案例与不同视角。

### Library

v1.0 初始典籍库包含：

- 史記
- 資治通鑑
- 戰國策
- 論語
- 孟子
- 莊子
- 韓非子
- 傳習錄
- 孫子兵法
- 世說新語

### Legacy

旧 D1 schema 移入 `legacy/`，仅保留为项目演进记录。
