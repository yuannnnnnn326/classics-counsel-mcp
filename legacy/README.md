# Legacy D1 schema

这里保存 v1.0 之前使用的 D1 / SQLite 数据结构。

旧方案需要把古籍人工切成 passages，再导入数据库。它能够提供结构化 chapter / section / sort_order，但在维护多部大型典籍时人工成本过高。

v1.0 已改成直接读取 GitHub `library/*.txt`，因此这里的 schema 不再是主路径。

保留它的原因：

- 记录项目演进；
- 未来如果要做自动索引，可以参考旧结构；
- 不让早期设计完全丢失。
