"""Installer tests isolate all filesystem state and mock registry writes."""
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest import mock


@unittest.skipUnless(os.name == 'nt', 'Windows installer')
class InstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source=Path(__file__).resolve().parents[1]/'native/setup.py'
        spec=importlib.util.spec_from_file_location('bridge_setup_test',source)
        cls.setup=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.setup)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.code=self.root/'portable VS Code'/'Code.exe';self.code.parent.mkdir();self.code.write_bytes(b'fixture')
        self.target=self.root/'local app data'/'OJBridge'
        self.patches=[mock.patch.object(self.setup,'BASE_KEYS',[]),mock.patch.object(self.setup,'detect_code',return_value=str(self.code)),mock.patch.object(self.setup,'default_code_root',return_value=self.root/'Redirected Documents'/'OJ'),mock.patch('builtins.print')]
        for patch in self.patches:patch.start()

    def tearDown(self):
        for patch in reversed(self.patches):patch.stop()
        self.temp.cleanup()

    def config(self):return json.loads((self.target/'native/config.json').read_text(encoding='utf-8'))

    def test_new_install_uses_resolved_default_and_portable_paths(self):
        self.setup.install(self.target)
        self.assertEqual(self.config()['root'],str(self.root/'Redirected Documents'/'OJ'))
        manifest=json.loads((self.target/'native/host-manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['path'],str(self.target/'native/host.cmd'))
        self.assertTrue((self.target/'native/bootstrap.ps1').exists())

    def test_upgrade_preserves_existing_root_template_and_naming(self):
        self.setup.install(self.target)
        config=self.config();config.update(root=str(self.root/'old code'),template='int main(){}',naming='platform_id')
        (self.target/'native/config.json').write_text(json.dumps(config),encoding='utf-8')
        self.setup.install(self.target)
        self.assertEqual(self.config()['root'],config['root']);self.assertEqual(self.config()['template'],config['template'])
        self.assertEqual(self.config()['naming'],'platform_id')

    def test_explicit_root_overrides_only_when_requested(self):
        wanted=self.root/'chosen code'
        self.setup.install(self.target,root=str(wanted),code=str(self.code))
        self.assertEqual(self.config()['root'],str(wanted))

    def test_invalid_cli_paths_fail_before_installation(self):
        with self.assertRaises(RuntimeError):self.setup.install(self.target,root='relative')
        with self.assertRaises(RuntimeError):self.setup.install(self.target,code=str(self.root/'missing.exe'))
        self.assertFalse(self.target.exists())

    def test_windows_powershell_bootstrap_detects_python_and_forwards_arguments(self):
        script=Path(__file__).resolve().parents[1]/'native/bootstrap.ps1'
        powershell=Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe'
        env=os.environ.copy();env.update(OJ_BRIDGE_PYTHON=os.sys.executable,PYTHONUTF8='1')
        result=subprocess.run([str(powershell),'-NoProfile','-ExecutionPolicy','Bypass','-File',str(script),'diagnose','--target',str(self.target)],capture_output=True,env=env,timeout=30)
        self.assertEqual(result.returncode,1)  # Intentionally uninstalled target.
        output=result.stdout.decode('utf-8',errors='replace')
        self.assertIn('Python:',output)
        self.assertNotIn('找不到 Windows 原生',output)


if __name__=='__main__':unittest.main(verbosity=2)
