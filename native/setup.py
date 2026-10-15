"""Per-user install/uninstall/diagnose. No administrator access required."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import sysconfig
import winreg

# Keep sibling imports explicit when the bootstrap invokes Python in isolated mode.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from native_host import DEFAULT_CONFIG, EXTENSION_ID, ORIGIN, VERSION, atomic_json, default_code_root

HOST_NAME = "com.ojbridge.native"
BASE_KEYS = [r"Software\Microsoft\Edge\NativeMessagingHosts", r"Software\Google\Chrome\NativeMessagingHosts"]


def detect_code(previous=""):
    candidates = [Path(previous)] if previous else []
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for name in (r"Software\Classes\vscode\shell\open\command", r"Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe"):
            try:
                with winreg.OpenKey(hive, name) as key:
                    value = winreg.QueryValueEx(key, "")[0]
                m = re.match(r'^"([^"]+)"', value)
                candidates.append(Path(m[1] if m else value))
            except OSError:
                pass
    for variable, suffix in (("LOCALAPPDATA", "Programs/Microsoft VS Code/Code.exe"), ("ProgramFiles", "Microsoft VS Code/Code.exe"), ("ProgramFiles(x86)", "Microsoft VS Code/Code.exe")):
        if os.environ.get(variable):
            candidates.append(Path(os.environ[variable])/suffix)
    code_cmd = shutil.which("code")
    if code_cmd:
        candidates.append(Path(code_cmd).parent.parent/"Code.exe")
    for candidate in candidates:
        if candidate.is_file() and candidate.name.lower() == "code.exe":
            return str(candidate.resolve())
    raise RuntimeError("未找到 VS Code。请先安装 VS Code，或安装时通过 --code 指定 Code.exe 的完整路径。")


def install(target, root=None, code=None):
    if sys.version_info[:2] < (3, 10) or sys.prefix != sys.base_prefix or sys.platform != "win32" or any(word in sysconfig.get_platform().lower() for word in ("mingw", "msys")):
        raise RuntimeError("请使用 Windows 原生的全局 Python 3.10 或更新版本，不要使用 venv/MSYS2 Python。")
    source = Path(__file__).resolve().parent.parent
    existing = target/"native/config.json"
    config = DEFAULT_CONFIG.copy()
    if existing.exists():
        config.update(json.loads(existing.read_text(encoding="utf-8-sig")))
    config["root"] = root or config.get("root") or str(default_code_root())
    if not Path(config["root"]).is_absolute():
        raise RuntimeError("--root 必须指定绝对路径。")
    if code and (not Path(code).is_file() or Path(code).name.lower() != "code.exe"):
        raise RuntimeError("--code 必须指向已有的 Code.exe 文件。")
    config["code_path"] = detect_code(code or config.get("code_path", ""))
    config["version"] = VERSION
    if source != target:
        for folder in ("extension", "native", "docs", "examples"):
            shutil.copytree(source/folder, target/folder, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "config.json", "host.cmd", "host-manifest.json"))
        for filename in ("install.cmd", "uninstall.cmd", "diagnose.cmd", "README.md", "LICENSE", "CHANGELOG.md"):
            shutil.copy2(source/filename, target/filename)
    native = target/"native"
    native.mkdir(parents=True, exist_ok=True)
    atomic_json(native/"config.json", config)
    launcher = native/"host.cmd"
    # cmd uses the system ANSI code page for script bytes; chcp first permits UTF-8 paths.
    launcher.write_text('@echo off\r\nchcp 65001 >nul\r\n"'+sys.executable+'" -I -u "'+str(native/"native_host.py")+'" %*\r\n', encoding="utf-8")
    manifest = {"name": HOST_NAME, "description": "OJ Bridge for VS Code", "path": str(launcher), "type": "stdio", "allowed_origins": [ORIGIN]}
    manifest_path = native/"host-manifest.json"
    atomic_json(manifest_path, manifest)
    for base in BASE_KEYS:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base+"\\"+HOST_NAME) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path))
    print("OJ Bridge 已安装（当前用户，无后台常驻服务）。")
    print("代码目录：", config["root"])
    print("Python：", sys.executable)
    print("VS Code：", config["code_path"])
    print("\n下一步：")
    print("1. 在 Edge 地址栏打开 edge://extensions。")
    print("2. 打开“开发人员模式”，选择“加载解压缩的扩展”。")
    print("3. 选择这个文件夹：", target/"extension")
    print("4. 在扩展设置中点击“检测连接”，然后刷新已打开的 OJ 题目。")
    print("扩展 ID：", EXTENSION_ID)
    return target/"extension"


def uninstall(target):
    removed = 0
    for base in BASE_KEYS:
        key_name = base+"\\"+HOST_NAME
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_name) as key:
                value = winreg.QueryValueEx(key, "")[0]
            if Path(value).resolve() == (target/"native/host-manifest.json").resolve():
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_name)
                removed += 1
        except FileNotFoundError:
            pass
    print(f"已移除 {removed} 项本地连接注册。")
    print("请在 edge://extensions 中移除 OJ Bridge 扩展。")
    print("源码、题目索引和安装文件均保留；确认无需使用后，可自行删除安装目录：", target)


def diagnose(target):
    native = target/"native"
    problems = []
    config_path = native/"config.json"
    if not config_path.exists():
        raise RuntimeError("未安装本地连接程序，请先运行 install.cmd。")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    for base in BASE_KEYS:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, base+"\\"+HOST_NAME) as key:
                value = winreg.QueryValueEx(key, "")[0]
            good = Path(value).is_file()
            print(base, "OK" if good else "缺少文件")
            if not good:
                problems.append("注册路径无效")
        except OSError:
            problems.append("缺少本地连接注册")
    request = json.dumps({"action":"ping"}).encode()
    import struct
    result = subprocess.run([sys.executable,"-I",str(native/"native_host.py"),ORIGIN],input=struct.pack("<I",len(request))+request,capture_output=True,timeout=15)
    size = struct.unpack("<I",result.stdout[:4])[0]
    response = json.loads(result.stdout[4:4+size])
    if not response.get("ok"):
        problems.append(response.get("error","未知错误"))
    print("消息连接：", "OK" if response.get("ok") else "失败")
    print("Python：",response.get("python"))
    print("VS Code：",config["code_path"])
    print("代码目录：",config["root"])
    print("扩展 ID：",EXTENSION_ID)
    if problems:
        raise RuntimeError("；".join(problems))
    print("本地检查全部通过。浏览器侧请在扩展设置中再次检测连接。")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("install","uninstall","diagnose"), nargs="?", default="install")
    parser.add_argument("--target", help="安装目录（用于隔离验证）")
    parser.add_argument("--root", help="代码目录，默认是当前用户的文档/OJ；升级保留现有设置")
    parser.add_argument("--code", help="VS Code 的 Code.exe 路径；未指定时自动检测")
    args = parser.parse_args()
    target = Path(args.target).resolve() if args.target else Path(os.environ["LOCALAPPDATA"])/"OJBridge"
    try:
        if args.action == "install":
            install(target, root=args.root, code=args.code)
        else:
            {"uninstall":uninstall,"diagnose":diagnose}[args.action](target)
    except Exception as e:
        print("操作失败：",e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
