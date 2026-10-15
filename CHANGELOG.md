# 更新记录

## 1.1.0 — 2026-10-15

- 默认源码目录改为当前用户的文档/OJ，支持 OneDrive 与文档重定向。
- Python 采用自动检测，支持原生 Windows 全局 Python 3.10+，优先 3.12；不使用 venv/MSYS2 Python。
- VS Code 支持注册表、PATH、常见安装位置检测，也可用 `--code` 指定便携版。
- 增加 `--root`、`--target` 安装参数；升级继续保留已有配置。
- 提供通用的 VS Code 编译和调试示例，将 exe 放入工作区的 exe 文件夹。
- 测试移除开发者的固定源码和编译器路径；打包排除用户配置和临时文件。
- 添加公开源码、CI、多版本检查及 GitHub Release 打包流程。

## 1.0.0 — 2026-10-15

- 实现 Edge MV3 扩展与 Windows Native Messaging 本地连接。
- 适配洛谷、曙梦、AtCoder、Codeforces、牛客竞赛、LibreOJ 和 Hydro 的题目身份。
- 自动创建带题目信息的 C++ 文件，支持网页填入、复制和条件直接提交。
