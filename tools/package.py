"""Build a clean share ZIP using the Python standard library."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'dist'/'OJ-Bridge-Edge-Windows.zip'
SKIP = {'__pycache__', '.git', 'node_modules', 'dist', 'work', '.venv', '.oj-bridge'}
PRIVATE = {'config.json', 'host-manifest.json', 'host.cmd'}


def main():
    manifest = json.loads((ROOT/'extension/manifest.json').read_text(encoding='utf-8'))
    import base64
    digest = hashlib.sha256(base64.b64decode(manifest['key'])).digest()[:16]
    extension_id = ''.join(chr(97+n) for b in digest for n in (b >> 4, b & 15))
    assert extension_id == 'bilbnpgbepfpocfaakmnmcejfpdofocp'
    required = ['README.md', 'install.cmd', 'uninstall.cmd', 'diagnose.cmd', 'extension/manifest.json', 'extension/background.js', 'extension/content.js', 'extension/editor.js', 'extension/core.js', 'extension/options.html', 'native/native_host.py', 'native/setup.py', 'docs/validation.md']
    for name in required:
        assert (ROOT/name).is_file(), name
    version = json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    assert manifest['version'] == version
    private_path = re.compile(r'[A-Za-z]:[\\/](?:Users[\\/]|cpp(?:[\\/\s"\'])|msys64[\\/])|[\\/]codex-runtimes[\\/]', re.I)
    for file in ROOT.rglob('*'):
        relative = file.relative_to(ROOT)
        if not file.is_file() or set(relative.parts) & SKIP or file.name in PRIVATE or file.suffix == '.pyc':
            continue
        if file.suffix.lower() not in ('.png', '.zip'):
            assert not private_path.search(file.read_text(encoding='utf-8-sig')), f'Personal or machine-specific path: {relative}'
    # Use Windows line endings for double-clickable script entry points.
    for filename in ['install.cmd', 'uninstall.cmd', 'diagnose.cmd']:
        file = ROOT/filename
        text = file.read_text(encoding='utf-8').replace('\r\n','\n')
        file.write_bytes(text.replace('\n','\r\n').encode('utf-8'))
    bootstrap = ROOT/'native/bootstrap.ps1'
    text = bootstrap.read_text(encoding='utf-8-sig').replace('\r\n','\n')
    bootstrap.write_bytes(text.replace('\n','\r\n').encode('utf-8-sig'))
    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(ROOT.rglob('*')):
            relative = file.relative_to(ROOT)
            if file.is_file() and not (set(relative.parts) & SKIP) and file.name not in PRIVATE and file.suffix != '.pyc':
                archive.write(file, 'OJBridge/'+relative.as_posix())
    with zipfile.ZipFile(OUT) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert all('OJBridge/'+name in names for name in required)
        assert not any('/../' in name or name.startswith('/') for name in names)
        assert not any(Path(name).name in PRIVATE for name in names)
        print('ZIP files:',len(names))
    print('ZIP:',OUT)
    print('Bytes:',OUT.stat().st_size)
    checksum = hashlib.sha256(OUT.read_bytes()).hexdigest()
    (OUT.parent/'SHA256SUMS.txt').write_text(checksum+'  '+OUT.name+'\n',encoding='utf-8')
    print('SHA256:',checksum)


if __name__=='__main__':main()
