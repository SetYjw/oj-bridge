# OJ Bridge

在 OJ 读题，在 VS Code 编程。适用于 Windows 10/11、Edge/Chrome、VS Code，以及 Windows 原生的全局 Python 3.10 或更新版本。安装器优先使用 3.12，不创建 venv。

[下载最新 Windows 安装包](https://github.com/SetYjw/oj-bridge/releases/latest) · [平台支持](docs/platforms.md) · [验证范围](docs/validation.md) · [更新记录](CHANGELOG.md)

## 安装（只做一次）

1. 解压整个安装包，双击 `install.cmd`。安装会复制到 `%LOCALAPPDATA%\OJBridge`，注册当前用户的浏览器本地连接；不需要管理员权限，不创建虚拟环境，没有常驻服务。
2. 打开 Edge 地址栏 `edge://extensions`，开启**开发人员模式**，点击**加载解压缩的扩展**。
3. 选择安装窗口给出的目录。默认可以在文件选择窗口的地址栏输入 `%LOCALAPPDATA%\OJBridge\extension`。选择 `extension` 文件夹本身，不是 ZIP 或外层目录。
4. 进入 OJ Bridge 的扩展选项，点击**检测连接**。刷新已经打开的 OJ 题目页面。

安装后可以移动原来的解压目录，但请保留 `%LOCALAPPDATA%\OJBridge`。更新时运行新版 `install.cmd`，再在扩展管理页点击重新加载。原有代码目录、命名规则和模板设置会保留。

兼容 Chrome：用 `chrome://extensions` 完成第 2–4 步即可。本地安装同时注册 Edge 与 Chrome，但本版主要针对 Edge 验证。

## 使用

打开支持的题目后，右下角会出现工具条，也可点击浏览器工具栏中的 OJ Bridge 图标。

- **在 VS Code 编程**：首次创建源码并附上平台、题号、题名、题目链接、可读取的时限和内存限制。再次点击会打开原文件，不覆盖代码。
- **填入网页 IDE**：打开该题的提交页并尝试填入代码。需要先在 VS Code 按 `Ctrl+S`，本工具读取的是磁盘上的文件。
- **复制代码**：复制对应文件内容。若浏览器不允许自动复制，工具条会展示可手动 `Ctrl+C` 的代码框。
- **填入并提交**：在已提供该入口的平台，核对题号、C++ 语言和编辑器内容后点击网站原有按钮。验证码、登录、提交记录和评测结果均以 OJ 原网页为准；提示“已点击提交按钮”不表示成功提交或通过评测。

网站改版、编辑器尚未加载或无法确认题号时，会提示手动填入或复制。洛谷、LibreOJ 和牛客目前提供填入/复制，不提供自动点击提交按钮。若页面未展开编辑器，请先展开代码/提交面板再点击填入。曙梦的直接提交属于 Hydro 风格表单的条件适配，尚未验证其登录页面；不可用时使用复制。

默认源码目录是**当前 Windows 用户的文档目录下的 OJ 文件夹**。文档目录通过 Windows Known Folder API 解析，支持 OneDrive 和文档重定向，不依赖用户名或盘符。升级会保留已有的源码目录、模板和命名设置。

新文件形如 `Luogu_P1001_A+B Problem.cpp`。扩展设置中可以改为“平台_题号.cpp”，也可以修改目录或模板。题目索引保存在代码目录下的 `.oj-bridge/index.json`，不要单独删除或移动，否则无法继续自动对应原文件。不同链接的题目即使同名也不会相互覆盖。

本工具不改写已有的 VS Code 编译配置。需要将 exe 放入独立文件夹时，可将 [examples/vscode](examples/vscode) 中的 `tasks.json` 和 `launch.json` 合并到源码目录的 `.vscode` 文件夹；示例使用 `${workspaceFolder}`、`${file}` 等变量，并从 PATH 查找 g++ / gdb。需要预先安装 C/C++ 扩展、MinGW-w64，并让 `g++`、`gdb` 可在终端运行。已有配置不要直接覆盖。

## 自定义安装位置和运行时

双击安装即可使用自动检测，也可在终端指定参数：

```text
install.cmd --root "<源码目录完整路径>"
install.cmd --target "<安装目录完整路径>" --code "<VS Code 的 Code.exe 完整路径>"
diagnose.cmd --target "<安装目录完整路径>"
uninstall.cmd --target "<安装目录完整路径>"
```

`--target` 指定工具的安装位置；`--root` 指定 C++ 源码位置，两者独立。使用自定义安装位置时，诊断和卸载需传入相同的 `--target`。

Python 自动检测顺序为 `OJ_BRIDGE_PYTHON`、Python Launcher 的 3.12、Launcher 的其他 Python 3、常见的当前用户安装位置和 PATH。候选必须是 Windows 原生的全局 Python 3.10+；venv 和 MSYS2/MinGW Python 会被跳过。可设置 `OJ_BRIDGE_PYTHON` 为希望使用的 `python.exe` 完整路径。

VS Code 会从用户/系统注册表、常见安装目录和 PATH 自动检测；便携版或特殊安装位置可通过 `--code` 指定。不需要修改脚本里的路径。

## 卸载与诊断

- 双击 `diagnose.cmd` 检查 Python、Native Messaging 注册、消息通信和 VS Code 路径；浏览器实际连接仍需在扩展选项里检测。
- 双击 `uninstall.cmd` 取消本工具的本地连接注册，然后在扩展管理页面移除 OJ Bridge。
- 卸载会保留所有 C++ 源码、索引及安装文件。无需使用后，可以自行删除 `%LOCALAPPDATA%\OJBridge`。

## 常见问题

**找不到本地连接程序**：先运行 `install.cmd`，确认加载的是安装目录中的扩展，扩展 ID 应为 `bilbnpgbepfpocfaakmnmcejfpdofocp`。受企业策略管理的浏览器可能禁止本地连接或解压缩扩展，需要由设备管理员处理。

**没有可用 Python**：从 [python.org](https://www.python.org/downloads/windows/) 安装原生 Windows Python 3.10 或更新版本，建议 3.12。无需 pip 安装任何依赖；安装器会跳过 MSYS2 Python 和 venv。

**刚写的代码没有带回来**：先 `Ctrl+S`；确认文件仍在原位置，且不是另一道题的文件。本工具不读取未保存的 VS Code 缓冲区。

**页面没有工具条**：刷新题目页面；确认扩展已启用、具有此网站的访问权限，并查看 [平台支持和验证范围](docs/platforms.md)。登录页、首页和评测记录页不显示题目工具条。

**填入失败**：先在网页打开提交/代码编辑器，完成登录后重试。多个编辑器或尚不兼容的编辑器不会强行写入；使用“复制代码”粘贴到网页即可。

**本地源码移走了**：将文件恢复到索引记录的位置。若确定要重新创建，可备份 `.oj-bridge/index.json` 后，只移除对应题目的记录，再重新点击打开。工具不会自动覆盖或替你删除旧源码。

**更改代码目录后旧题文件找不到**：新目录有独立索引。切换回原目录即可继续；需要搬家时请一起搬动源码与 `.oj-bridge` 目录。

## 源码与验证

扩展和本地程序均为完整源码，无远程脚本、遥测或第三方 Python 运行依赖。开发测试需要 Python 3.10+ 与 Node.js 20+，可以运行：

```text
python -m unittest discover -s tests -p "test_*.py" -v
node --test tests/core.test.cjs
```

浏览器集成测试依赖 Playwright 与 Edge，仅用于开发，不是用户运行插件所需依赖。详细能力、真实页面验证边界见 [验证报告](docs/validation.md)，新增平台说明见 [开发说明](docs/development.md)。

公开仓库不包含任何用户的本地配置、源码、题目索引或安装时解析出的绝对路径。MIT 许可，欢迎提交平台适配改进。

连接接口依据 [Edge Native Messaging 文档](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)与 [Chrome Native Messaging 文档](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。
