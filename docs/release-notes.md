OJ Bridge 1.1.0：可在不同 Windows 用户、盘符和安装位置使用的 OJ → VS Code 工作流。

- 解压 ZIP，双击 install.cmd，再在 Edge/Chrome 中加载安装目录的 extension 文件夹。
- 默认源码位于当前用户的文档/OJ；支持 OneDrive、文档重定向和自定义目录。
- 自动检测原生 Windows Python 3.10+（优先 3.12）和 VS Code，不创建虚拟环境。
- 升级保留已配置的源码目录、模板和命名规则。
- 使用 SHA256SUMS.txt 验证下载文件完整性。

题目页显示“在 VS Code 编程”“填入网页 IDE”“复制代码”。请先 Ctrl+S 保存；条件直接提交会核对题号、语言和编辑器内容。

洛谷、AtCoder 公开题目的识别已做真实 Edge 检查。曙梦本次真实页面连接失败，当前适配以 URL 和 Hydro 上游模板/样本为依据。其他平台与登录后的真实提交边界请阅读 docs/validation.md。没有向真实 OJ 发送自动化测试提交。
