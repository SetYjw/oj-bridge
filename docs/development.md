# 扩展和维护

## 目录

- `extension/core.js`：URL 规范化、平台身份、提交页面对应关系、题名和限制读取。
- `extension/background.js`：校验消息来源、Native Messaging、每个标签页的题目上下文和跨页面填入。
- `extension/content.js`：网页工具条、复制回退、单页导航检测。
- `extension/editor.js`：只在主动填入时注入 MAIN world，调用网页现有编辑器接口，核对内容、题号和语言。
- `native/native_host.py`：标准库 Native Messaging host，受限文件操作和 VS Code 调用。
- `native/setup.py`：当前用户注册、检测与卸载。
- `native/bootstrap.ps1`：自动挑选受支持的全局 Windows Python，不依赖固定安装目录。
- `examples/vscode/`：使用工作区变量及 PATH 的可选编译/调试示例。
- `tests/`：Python、Node 和 Edge 隔离集成验证。

## 添加平台

1. 在 `manifest.json` 精确增加所需 HTTPS 站点权限。
2. 在 `core.js` 增加 URL 解析和唯一题目标识，提供规范题目 URL 与提交 URL。避免不同题目共享同一身份。
3. 在 `native_host.py` 的 `parse_problem_url` 加入同样的严格规则；浏览器和本地端必须一致。
4. 根据真实页面增加标题读取、编辑器或语言字段适配。提供可复制回退。
5. 如果需要直接提交，必须增加明确的题号确认、C++ 选项确认和唯一提交控件。不要对所有 `button[type=submit]` 盲目点击。
6. 增加正例、伪装域名、其他题目页面、登录页面和编辑器样本测试，更新平台能力表。

Manifest 的 `key` 是公开的扩展身份密钥，不是密码。它确保解压缩扩展在不同安装目录拥有同一个 ID。修改 key 会改变 ID，必须同步 `native_host.py` 的授权来源，并重装本地程序。

## 数据和权限

本地请求只接受 ping、configure、open、read；源码通过题目 URL 查索引，不接受网页的任意本地路径。设置修改仅允许扩展自己的页面发送。本地程序检查浏览器传入的扩展 origin。磁盘索引、文件名、路径边界和消息长度均有校验；并发创建同一道题通过文件锁串行处理。扩展不是抵御同一 Windows 用户下恶意本地进程的隔离边界。

代码仅在用户点击填入、复制或提交时读取；浏览器会话保存的是题目身份和待续操作，不持久保存源码。扩展不读取/导出 Cookie，不保存 OJ 密码，也不进行后台提交。

直接提交调用网站原有按钮，因此登录状态、反爬、验证码、站点规则和前端改版均可能阻止提交。应向用户明确展示动作已完成和评测成功之间的差别。

## 构建分享包

`python tools/package.py` 生成 `dist/OJ-Bridge-Edge-Windows.zip` 并检查固定扩展 ID、必需文件、CRC 与通用路径约束，排除 .git、运行缓存、真实用户配置和临时文件。安装运行无 npm install 或 pip install 步骤。

核心测试可在 Windows/Linux 的 Python 3.10+ 运行，Windows 安装器测试使用临时目录和模拟注册表。Edge 集成测试需要全局 Windows Python、Edge、VS Code、MinGW-w64 g++ 和 Playwright，可通过 `OJ_PYTHON`、`OJ_EDGE`、`OJ_CXX`、`OJ_PLAYWRIGHT`、`OJ_TEST_WORK` 覆盖自动检测。编译器及 DLL 目录从被检测到的 g++ 所在位置解析。

`native/bootstrap.ps1` 以 UTF-8 BOM 保存，以兼容 Windows PowerShell 5.1。双击入口使用 CRLF；打包脚本会统一这两项编码。设置 `OJ_BRIDGE_NO_PAUSE=1` 可在自动化脚本中取消 cmd 入口的退出暂停。

GitHub Actions 对核心代码运行多版本 Python 和 Node 检查；推送到 main 且修改 package.json，或手动运行 Release workflow，会在检查通过后创建当前版本的 GitHub Release，附带 ZIP 和 SHA256 校验文件。已有版本不会自动覆盖。
