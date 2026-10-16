"""OJ Bridge native host. Python 3.10+, standard library only."""
from __future__ import annotations

import contextlib
import ctypes
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import urlsplit, urlunsplit

VERSION = "1.2.0"
EXTENSION_ID = "bilbnpgbepfpocfaakmnmcejfpdofocp"
ORIGIN = f"chrome-extension://{EXTENSION_ID}/"
MAX_MESSAGE = 768 * 1024
MAX_CODE = 512 * 1024
DEFAULT_TEMPLATE = "#include<bits/stdc++.h>\nusing namespace std;\n\n\nint main() {\n\n    return 0;\n}\n"
DEFAULT_CONFIG = {
    "root": "", "naming": "platform_id_title", "template": DEFAULT_TEMPLATE,
    "code_path": "", "version": VERSION,
}


class BridgeError(Exception):
    pass


def documents_directory():
    """Resolve Windows Documents, including OneDrive and redirected folders."""
    if os.name == "nt":
        try:
            folder_id = ctypes.create_string_buffer(uuid.UUID("FDD39AD0-238F-46AF-ADB4-6C85480369C7").bytes_le)
            pointer = ctypes.c_void_p()
            result = ctypes.windll.shell32.SHGetKnownFolderPath(folder_id, 0, None, ctypes.byref(pointer))
            if result == 0 and pointer.value:
                try:
                    return Path(ctypes.wstring_at(pointer.value))
                finally:
                    ctypes.windll.ole32.CoTaskMemFree(pointer)
        except (AttributeError, OSError, ValueError):
            pass
    return Path.home() / "Documents"


def default_code_root():
    return documents_directory() / "OJ"


def clean_text(value, limit=300):
    if not isinstance(value, str):
        return ""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", value).strip()[:limit]


def parse_problem_url(raw):
    """Identity derives from a recognized URL, never a page-provided file path."""
    if not isinstance(raw, str) or len(raw) > 2000:
        raise BridgeError("题目链接无效。")
    u = urlsplit(raw)
    host = (u.hostname or "").lower()
    try:
        port = u.port
    except ValueError:
        raise BridgeError("题目链接端口无效。") from None
    if u.scheme != "https" or u.username or u.password or port not in (None, 443):
        raise BridgeError("仅支持已适配 OJ 的 HTTPS 题目链接。")
    path = u.path.rstrip("/")
    platform = pid = canonical_path = None
    if host in ("leetcode.cn", "www.leetcode.cn", "leetcode.com", "www.leetcode.com"):
        match = re.fullmatch(r"/(?:contest/[A-Za-z0-9_-]+/)?problems/([a-z0-9-]+)(?:/(?:description|editorial|solutions|submissions))?", path)
        if match:
            host = host.removeprefix("www.")
            platform, pid = "LeetCodeCN" if host == "leetcode.cn" else "LeetCode", match[1]
            canonical_path = f"/problems/{pid}"
    elif host in ("www.luogu.com.cn", "www.luogu.com", "luogu.com.cn", "luogu.com"):
        match = re.fullmatch(r"/problem/([A-Za-z0-9_-]+)(?:/submit)?", path)
        if match:
            platform, pid = "Luogu", match[1]
            host, canonical_path = "www.luogu.com.cn", f"/problem/{pid}"
    elif host == "oj.shumeng.tech":
        match = re.fullmatch(r"/p/([A-Za-z0-9_-]+)(?:/submit)?", path)
        if match:
            platform, pid = "Shumeng", match[1]
            canonical_path = f"/p/{pid}"
    elif host == "atcoder.jp":
        match = re.fullmatch(r"/contests/([A-Za-z0-9_-]+)/tasks/([A-Za-z0-9_-]+)", path)
        if match:
            platform, pid = "AtCoder", match[2]
            canonical_path = f"/contests/{match[1]}/tasks/{pid}"
    elif host in ("codeforces.com", "www.codeforces.com", "m1.codeforces.com", "m2.codeforces.com", "m3.codeforces.com"):
        match = re.fullmatch(r"/(?:contest|gym)/(\d+)/problem/([A-Za-z][A-Za-z0-9]*)", path)
        problemset = re.fullmatch(r"/problemset/problem/(\d+)/([A-Za-z][A-Za-z0-9]*)", path)
        if match or problemset:
            m = match or problemset
            kind = "gym" if path.startswith("/gym/") else "contest"
            platform, pid = "Codeforces", f"{m[1]}_{m[2].upper()}"
            host, canonical_path = "codeforces.com", f"/{kind}/{m[1]}/problem/{m[2].upper()}"
    elif host in ("ac.nowcoder.com", "www.nowcoder.com"):
        match = re.fullmatch(r"/acm/contest/(\d+)/([A-Za-z][A-Za-z0-9]*)", path)
        if match:
            platform, pid = "NowCoder", f"{match[1]}_{match[2].upper()}"
            host, canonical_path = "ac.nowcoder.com", f"/acm/contest/{match[1]}/{match[2].upper()}"
    elif host in ("loj.ac", "www.loj.ac"):
        match = re.fullmatch(r"/p/(\d+)(?:/submit)?", path)
        if match:
            platform, pid = "LibreOJ", match[1]
            host, canonical_path = "loj.ac", f"/p/{pid}"
    elif host in ("hydro.ac", "hydrooj.com") or host.endswith(".hydro.ac") or host.endswith(".hydrooj.com"):
        match = re.fullmatch(r"(/d/[A-Za-z0-9_-]+)?/p/([A-Za-z0-9_-]+)(?:/submit)?", path)
        if match:
            domain = (match[1] or "").removeprefix("/d/")
            platform, pid = "Hydro", f"{domain}_{match[2]}" if domain else match[2]
            canonical_path = f"{match[1] or ''}/p/{match[2]}"
    if not canonical_path:
        raise BridgeError("当前网址不是已支持的题目页面；请先打开题目正文。")
    return {"platform": platform, "id": pid, "url": urlunsplit(("https", host, canonical_path, "", ""))}


def problem_info(value):
    if not isinstance(value, dict):
        raise BridgeError("缺少题目信息。")
    info = parse_problem_url(value.get("url"))
    info.update({name: clean_text(value.get(name), limit) for name, limit in (
        ("title", 180), ("timeLimit", 120), ("memoryLimit", 120))})
    info["title"] = info["title"] or info["id"]
    if info["platform"] in ("LeetCode", "LeetCodeCN"):
        info["frontendId"] = clean_text(value.get("frontendId"), 80)
        info["starterCode"] = value.get("starterCode", "")
    return info


def safe_name(value):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value)
    value = re.sub(r"\s+", " ", value).strip(" .")[:90].rstrip(" .")
    if not value or re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", value, re.I):
        value = "_" + (value or "problem")
    return value


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".oj-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


@contextlib.contextmanager
def file_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a+b") as f:
        f.seek(0, 2)
        if not f.tell():
            f.write(b"0"); f.flush()
        if os.name == "nt":
            import msvcrt
            for attempt in range(80):
                try:
                    f.seek(0); msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if attempt == 79:
                        raise BridgeError("另一个操作仍在写入，请稍后重试。") from None
                    time.sleep(.05)
            try:
                yield
            finally:
                f.seek(0); msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)


class Host:
    def __init__(self, config_path):
        self.config_path = Path(config_path).resolve()
        self.config = DEFAULT_CONFIG | json.loads(self.config_path.read_text(encoding="utf-8-sig"))
        if not self.config["root"]:
            self.config["root"] = str(default_code_root())

    @property
    def root(self):
        root = Path(self.config["root"])
        if not root.is_absolute():
            raise BridgeError("代码目录必须是绝对路径。")
        return root.resolve()

    def settings(self):
        return {k: self.config[k] for k in ("root", "naming", "template")}

    def index_location(self):
        root = self.root
        root.mkdir(parents=True, exist_ok=True)
        meta = root / ".oj-bridge"
        if meta.is_symlink() or not meta.resolve().is_relative_to(root):
            raise BridgeError("元数据目录不能指向代码目录之外。")
        meta.mkdir(exist_ok=True)
        return meta / "index.json"

    def checked_file(self, name):
        if not isinstance(name, str) or re.search(r'[<>:"/\\|?*\x00-\x1f]', name) or Path(name).name != name or not name.lower().endswith(".cpp"):
            raise BridgeError("本地文件索引无效。")
        path = self.root / name
        if path.is_symlink() or not path.resolve().is_relative_to(self.root):
            raise BridgeError("题目文件不能指向代码目录之外。")
        return path

    def source_text(self, info):
        def comment(s):
            return s.replace("*/", "* /")
        fields = [("平台", info["platform"]), ("题号", info.get("frontendId") or info["id"]), ("题目", info["title"]), ("链接", info["url"])]
        if info["timeLimit"]:
            fields.append(("时限", info["timeLimit"]))
        if info["memoryLimit"]:
            fields.append(("内存", info["memoryLimit"]))
        header = "/*\n" + "\n".join(f" * {label}：{comment(value)}" for label, value in fields) + "\n */\n\n"
        if info["platform"] in ("LeetCode", "LeetCodeCN"):
            starter = info.get("starterCode")
            if not isinstance(starter, str) or not starter.strip() or len(starter) > 32768 or "\0" in starter:
                raise BridgeError("未取得力扣官方 C++ 初始代码，未创建文件。请确保题目可访问，刷新后重试；已有文件仍可打开或复制。")
            return header + "#include<bits/stdc++.h>\nusing namespace std;\n\n" + starter.replace("\r\n", "\n").rstrip() + "\n"
        return header + self.config["template"].replace("\r\n", "\n")

    def find_or_create(self, value, create):
        info = problem_info(value)
        key = hashlib.sha256(info["url"].encode()).hexdigest()
        index_path = self.index_location()
        with file_lock(index_path.with_suffix(".lock")):
            index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
            if key in index:
                path = self.checked_file(index[key]["file"])
                if not path.exists():
                    raise BridgeError("对应源码已移动或删除。请恢复文件，或在 .oj-bridge/index.json 中移除该题记录后重建。")
                if not path.is_file():
                    raise BridgeError("题目路径不是普通文件。")
                return path, info, False
            if not create:
                raise BridgeError("这道题还没有本地文件，请先点击“在 VS Code 编程”。")
            source = self.source_text(info)
            stem = f'{info["platform"]}_{info.get("frontendId") or info["id"]}'
            if self.config["naming"] == "platform_id_title":
                stem += "_" + info["title"]
            stem = safe_name(stem)
            path = self.checked_file(stem + ".cpp")
            n = 0
            while path.exists():
                n += 1
                path = self.checked_file(f"{stem}_{key[:8]}{'_' + str(n) if n > 1 else ''}.cpp")
            # Exclusive creation protects unrelated files even under a concurrent external writer.
            with open(path, "x", encoding="utf-8", newline="\n") as f:
                f.write(source)
            index[key] = {"file": path.name, **{k: v for k, v in info.items() if k != "starterCode"}}
            atomic_json(index_path, index)
            return path, info, True

    def open_code(self, path):
        code = Path(self.config.get("code_path", ""))
        if not code.is_file():
            raise BridgeError("未找到 VS Code。请重新运行安装脚本以检测安装位置。")
        if os.name != "nt":
            raise BridgeError("本连接程序需要 Windows。")
        shell_execute = ctypes.windll.shell32.ShellExecuteW
        shell_execute.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_int]
        shell_execute.restype = ctypes.c_void_p
        parameters = subprocess.list2cmdline(["--reuse-window", str(self.root), "--goto", str(path)])
        result = shell_execute(None, "open", str(code), parameters, str(self.root), 1)
        if not result or result <= 32:
            raise BridgeError("源码已准备好，但未能打开 VS Code。请手动打开文件或重新安装连接程序。")

    def handle(self, message):
        if not isinstance(message, dict):
            raise BridgeError("请求格式无效。")
        action = message.get("action")
        if action == "ping":
            return {"ok": True, "version": VERSION, "python": sys.version.split()[0], "settings": self.settings(), "codeFound": Path(self.config.get("code_path", "")).is_file()}
        if action == "configure":
            value = message.get("settings")
            if not isinstance(value, dict):
                raise BridgeError("设置格式无效。")
            root = value.get("root")
            template = value.get("template")
            naming = value.get("naming")
            if not isinstance(root, str) or not root.strip() or not Path(root).is_absolute():
                raise BridgeError("请填写完整的绝对路径，可以使用文档目录下的 OJ 文件夹。")
            if naming not in ("platform_id_title", "platform_id"):
                raise BridgeError("未知命名规则。")
            if not isinstance(template, str) or not template.strip() or len(template.encode("utf-8")) > 32000:
                raise BridgeError("模板不能为空或超过 32 KB。")
            if len(Path(root).parts) < 2:
                raise BridgeError("请选择一个代码文件夹，不能直接使用磁盘根目录。")
            self.config.update(root=str(Path(root).resolve()), naming=naming, template=template)
            atomic_json(self.config_path, self.config)
            return {"ok": True, "settings": self.settings()}
        if action in ("open", "read"):
            path, info, created = self.find_or_create(message.get("problem"), action == "open")
            result = {"ok": True, "path": str(path), "problem": info, "created": created}
            if action == "open":
                self.open_code(path)
            else:
                if path.stat().st_size > MAX_CODE:
                    raise BridgeError("源码超过 512 KB，请手动复制。")
                result["code"] = path.read_text(encoding="utf-8-sig")
                if not result["code"].strip():
                    raise BridgeError("本地源码为空，请先在 VS Code 中保存代码。")
            return result
        raise BridgeError("未知操作。")


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise BridgeError("消息头不完整。")
    size = struct.unpack("<I", header)[0]
    if not 0 < size <= MAX_MESSAGE:
        raise BridgeError("请求过大或长度无效。")
    data = stream.read(size)
    if len(data) != size:
        raise BridgeError("消息内容不完整。")
    return json.loads(data.decode("utf-8"))


def write_message(stream, value):
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(data) > MAX_MESSAGE:
        data = json.dumps({"ok": False, "error": "响应过大，请手动复制。"}, ensure_ascii=False).encode("utf-8")
    stream.write(struct.pack("<I", len(data)) + data)
    stream.flush()


def main():
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    try:
        if len(sys.argv) < 2 or sys.argv[1] != ORIGIN:
            raise BridgeError("调用来源未获授权。请从 OJ Bridge 扩展操作。")
        message = read_message(sys.stdin.buffer)
        if message is None:
            return
        host = Host(Path(__file__).with_name("config.json"))
        result = host.handle(message)
    except (BridgeError, ValueError, OSError, KeyError, TypeError) as error:
        result = {"ok": False, "error": str(error)}
    except Exception:
        result = {"ok": False, "error": "连接程序遇到意外错误，请运行诊断。"}
    write_message(sys.stdout.buffer, result)


if __name__ == "__main__":
    main()
