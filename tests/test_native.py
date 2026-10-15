import concurrent.futures
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1]/'native/native_host.py'
spec = importlib.util.spec_from_file_location('bridge_native', SOURCE)
bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)


class HostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.config_path = self.base/'config.json'
        self.root = self.base/'中文 source files'
        self.config = bridge.DEFAULT_CONFIG | {'root':str(self.root),'code_path':sys.executable}
        bridge.atomic_json(self.config_path,self.config)
        self.host = bridge.Host(self.config_path)
        self.host.open_code = lambda path: None
        self.problem = {'url':'https://www.luogu.com.cn/problem/P1001','title':'A+B Problem','timeLimit':'1s','memoryLimit':'128MB'}

    def tearDown(self):
        self.temp.cleanup()

    def test_create_template_header_and_read(self):
        result=self.host.handle({'action':'open','problem':self.problem})
        self.assertTrue(result['created']);path=Path(result['path'])
        self.assertEqual(path.parent,self.root);self.assertEqual(path.name,'Luogu_P1001_A+B Problem.cpp')
        text=path.read_text(encoding='utf-8')
        self.assertIn('#include<bits/stdc++.h>',text);self.assertIn('int main()',text)
        self.assertIn('https://www.luogu.com.cn/problem/P1001',text)
        self.assertIn('时限：1s',text)
        self.assertEqual(self.host.handle({'action':'read','problem':self.problem})['code'],text)

    def test_reopen_does_not_overwrite_saved_code(self):
        first=self.host.handle({'action':'open','problem':self.problem})
        Path(first['path']).write_text('int main(){return 42;}',encoding='utf-8')
        second=self.host.handle({'action':'open','problem':self.problem|{'title':'renamed title'}})
        self.assertFalse(second['created']);self.assertEqual(first['path'],second['path'])
        self.assertEqual(Path(first['path']).read_text(),'int main(){return 42;}')

    def test_unrelated_name_collision_is_preserved(self):
        self.root.mkdir();existing=self.root/'Luogu_P1001_A+B Problem.cpp';existing.write_text('original')
        result=self.host.handle({'action':'open','problem':self.problem})
        self.assertNotEqual(result['path'],str(existing));self.assertEqual(existing.read_text(),'original')

    def test_comment_injection_and_bad_filename(self):
        result=self.host.handle({'action':'open','problem':self.problem|{'title':'../bad:*?/title */\n#include<evil>'}})
        path=Path(result['path']);self.assertEqual(path.parent,self.root)
        text=path.read_text(encoding='utf-8');self.assertEqual(text.count('*/'),1)
        self.assertFalse(any(line.lstrip().startswith('#include<evil>') for line in text.splitlines()))

    def test_missing_file_is_not_silently_recreated(self):
        result=self.host.handle({'action':'open','problem':self.problem});Path(result['path']).unlink()
        with self.assertRaisesRegex(bridge.BridgeError,'移动或删除'):
            self.host.handle({'action':'open','problem':self.problem})

    def test_read_requires_prior_creation(self):
        with self.assertRaisesRegex(bridge.BridgeError,'还没有本地文件'):
            self.host.handle({'action':'read','problem':self.problem})

    def test_reject_empty_and_oversized_source(self):
        result=self.host.handle({'action':'open','problem':self.problem});p=Path(result['path'])
        p.write_text('')
        with self.assertRaisesRegex(bridge.BridgeError,'源码为空'):self.host.handle({'action':'read','problem':self.problem})
        p.write_bytes(b'x'*(bridge.MAX_CODE+1))
        with self.assertRaisesRegex(bridge.BridgeError,'512 KB'):self.host.handle({'action':'read','problem':self.problem})

    def test_settings_validation_and_persistence(self):
        settings={'root':str(self.base/'other'),'naming':'platform_id','template':'int main(){}\n'}
        self.host.handle({'action':'configure','settings':settings})
        host=bridge.Host(self.config_path);self.assertEqual(host.settings(),settings)
        host.open_code=lambda path:None
        result=host.handle({'action':'open','problem':self.problem})
        self.assertEqual(Path(result['path']).name,'Luogu_P1001.cpp')

    def test_blank_root_uses_current_user_documents(self):
        redirected = self.base/'Redirected Documents'
        bridge.atomic_json(self.config_path,self.config|{'root':''})
        with mock.patch.object(bridge,'documents_directory',return_value=redirected):
            host=bridge.Host(self.config_path)
        self.assertEqual(host.root,redirected/'OJ')
        self.assertFalse(host.root.exists(),'Default path resolution must not create directories')

    def test_existing_user_root_is_not_replaced_by_new_default(self):
        with mock.patch.object(bridge,'documents_directory',return_value=self.base/'different'):
            host=bridge.Host(self.config_path)
        self.assertEqual(host.root,self.root)

    def test_known_documents_resolution_returns_absolute_path(self):
        self.assertTrue(bridge.documents_directory().is_absolute())

    def test_reject_relative_root_invalid_naming_and_large_template(self):
        settings=self.host.settings()
        for change in [{'root':'relative'},{'naming':'../../bad'},{'template':''},{'template':'中'*33000}]:
            with self.assertRaises(bridge.BridgeError):self.host.handle({'action':'configure','settings':settings|change})

    def test_reject_index_path_traversal(self):
        self.host.handle({'action':'open','problem':self.problem})
        p=self.root/'.oj-bridge/index.json';data=json.loads(p.read_text(encoding='utf-8'))
        next(iter(data.values()))['file']='../outside.cpp';bridge.atomic_json(p,data)
        with self.assertRaises(bridge.BridgeError):self.host.handle({'action':'read','problem':self.problem})

    def test_concurrent_open_creates_one_file(self):
        def create(_):
            host=bridge.Host(self.config_path);host.open_code=lambda path:None
            return host.handle({'action':'open','problem':self.problem})
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:results=list(executor.map(create,range(8)))
        self.assertEqual(len({r['path'] for r in results}),1)
        self.assertEqual(sum(r['created'] for r in results),1)

    def test_bom_and_chinese_source(self):
        result=self.host.handle({'action':'open','problem':self.problem})
        Path(result['path']).write_text('// 中文\nint main(){}',encoding='utf-8-sig')
        self.assertEqual(self.host.handle({'action':'read','problem':self.problem})['code'],'// 中文\nint main(){}')


class ProtocolTests(unittest.TestCase):
    def test_roundtrip_non_ascii_binary_message(self):
        stream=io.BytesIO();bridge.write_message(stream,{'中文':'一行\n二行'});stream.seek(0)
        self.assertEqual(bridge.read_message(stream),{'中文':'一行\n二行'})

    def test_reject_truncation_and_excessive_lengths(self):
        for raw in [b'\x01',struct.pack('<I',bridge.MAX_MESSAGE+1),struct.pack('<I',8)+b'{}',struct.pack('<I',0)]:
            with self.assertRaises(bridge.BridgeError):bridge.read_message(io.BytesIO(raw))
        self.assertIsNone(bridge.read_message(io.BytesIO()))

    def test_actual_native_process_origin_and_ping(self):
        with tempfile.TemporaryDirectory() as folder:
            temp=Path(folder);shutil.copy2(SOURCE,temp/'native_host.py')
            bridge.atomic_json(temp/'config.json',bridge.DEFAULT_CONFIG|{'root':str(temp/'code'),'code_path':sys.executable})
            request=io.BytesIO();bridge.write_message(request,{'action':'ping'})
            for origin,ok in [(bridge.ORIGIN,True),('chrome-extension://unauthorized/',False)]:
                process=subprocess.run([sys.executable,'-I',str(temp/'native_host.py'),origin],input=request.getvalue(),capture_output=True,timeout=10)
                response=bridge.read_message(io.BytesIO(process.stdout))
                self.assertEqual(response['ok'],ok);self.assertEqual(process.stderr,b'')
                if ok:self.assertGreaterEqual(tuple(map(int,response['python'].split('.')[:2])),(3,10))

    def test_platform_identities_and_rejections(self):
        fixtures=[('https://oj.shumeng.tech/p/CSP202609B/submit','Shumeng','CSP202609B'),('https://atcoder.jp/contests/abc425/tasks/abc425_a','AtCoder','abc425_a'),('https://codeforces.com/problemset/problem/2268/A','Codeforces','2268_A'),('https://ac.nowcoder.com/acm/contest/123/A','NowCoder','123_A'),('https://loj.ac/p/1000','LibreOJ','1000'),('https://hydro.ac/d/a/p/P1','Hydro','a_P1')]
        for url,platform,pid in fixtures:
            parsed=bridge.parse_problem_url(url);self.assertEqual((parsed['platform'],parsed['id']),(platform,pid))
        for url in ['https://luogu.com.cn.evil.test/problem/P1','http://www.luogu.com.cn/problem/P1','https://name:pass@www.luogu.com.cn/problem/P1','https://www.luogu.com.cn:444/problem/P1','https://oj.shumeng.tech/login']:
            with self.assertRaises(bridge.BridgeError):bridge.parse_problem_url(url)

    def test_reserved_and_long_filenames(self):
        for name in ['CON','con.cpp','NUL','LPT1','PRN']:
            self.assertTrue(bridge.safe_name(name).startswith('_'))
        self.assertLessEqual(len(bridge.safe_name('x'*400)),90)
        self.assertEqual(bridge.safe_name(' a:b? . '),'a_b_')


if __name__=='__main__':unittest.main(verbosity=2)
