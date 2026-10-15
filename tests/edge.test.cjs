/* Isolated Edge profile and synthetic OJ pages; never sends real OJ submissions. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.OJ_PLAYWRIGHT || 'playwright');
const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(process.env.OJ_TEST_WORK || path.join(os.tmpdir(), 'OJBridge-tests', `run-${Date.now()}`));
function findPython() {
  if (process.env.OJ_PYTHON) return process.env.OJ_PYTHON;
  for (const [command, prefix] of [['py', ['-3.12']], ['py', ['-3']], ['python', []]]) {
    try { return execFileSync(command, [...prefix, '-c', 'import sys;print(sys.executable)'], {encoding:'utf8'}).trim(); } catch {}
  }
  throw new Error('Set OJ_PYTHON to a global Windows Python 3.10+ executable.');
}
const PYTHON = findPython();
const EDGE = process.env.OJ_EDGE || [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
  .filter(Boolean).map(root => path.join(root, 'Microsoft/Edge/Application/msedge.exe')).find(file => fs.existsSync(file));
const CXX = process.env.OJ_CXX || 'g++';
const CXX_PATH = fs.existsSync(CXX) ? path.resolve(CXX) : execFileSync('where.exe', [CXX], {encoding:'utf8'}).trim().split(/\r?\n/)[0];
const ID = 'bilbnpgbepfpocfaakmnmcejfpdofocp';
const env = { ...process.env, PYTHONUTF8: '1' };
const py = (args, options = {}) => execFileSync(PYTHON, args, { env, encoding: 'utf8', ...options });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('Edge 扩展、真实 Native Messaging 与网页编辑器集成', { timeout: 120000 }, async t => {
  fs.mkdirSync(WORK, { recursive: true });
  const install = path.join(WORK, 'installed');
  const codeRoot = path.join(WORK, '中文 code');
  const record = path.join(WORK, 'code-open.txt');
  const registryBackup = path.join(WORK, 'registry-backup.json');
  const keys = ['Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.ojbridge.native', 'Software\\Google\\Chrome\\NativeMessagingHosts\\com.ojbridge.native'];
  py(['-c', `import winreg,json,sys
data={}
for name in json.loads(sys.argv[1]):
 try:
  with winreg.OpenKey(winreg.HKEY_CURRENT_USER,name) as key:data[name]=winreg.QueryValueEx(key,'')[0]
 except FileNotFoundError:data[name]=None
open(sys.argv[2],'w',encoding='utf-8').write(json.dumps(data))`, JSON.stringify(keys), registryBackup]);
  let context;
  try {
    py([path.join(ROOT, 'native/setup.py'), 'install', '--target', install]);
    py([path.join(ROOT, 'native/setup.py'), 'diagnose', '--target', install]);
    // A harmless GUI recorder verifies the native host launches the right workspace/file,
    // without switching or modifying the user's VS Code window.
    const recorderSource = path.join(WORK, 'record-open.cpp');
    const recorder = path.join(WORK, 'Code.exe');
    fs.writeFileSync(recorderSource, `#include <windows.h>\n#include <cwchar>\nint WINAPI wWinMain(HINSTANCE,HINSTANCE,PWSTR,int){Sleep(1000);HANDLE f=CreateFileW(L${JSON.stringify(record)},GENERIC_WRITE,FILE_SHARE_READ,nullptr,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(f==INVALID_HANDLE_VALUE)return 1;DWORD n;auto s=GetCommandLineW();WriteFile(f,s,(DWORD)(wcslen(s)*sizeof(wchar_t)),&n,nullptr);CloseHandle(f);return 0;}\n`);
    execFileSync(CXX_PATH, ['-municode', '-mwindows', '-static', recorderSource, '-o', recorder], { env, timeout: 30000 });
    const configPath = path.join(install, 'native/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...config, root: codeRoot, code_path: recorder }, null, 2));
    const extension = path.join(install, 'extension');
    context = await chromium.launchPersistentContext(path.join(WORK, 'profile'), {
      executablePath: EDGE, headless: true, viewport: { width: 1200, height: 860 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 12000 });
    assert.equal(await worker.evaluate(() => chrome.runtime.id), ID);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${ID}/options.html`);
    await options.waitForFunction(() => document.getElementById('connection').textContent.includes('已连接'));
    assert.equal(await options.locator('#root').inputValue(), codeRoot);
    await options.locator('#naming').selectOption('platform_id');
    await options.getByRole('button', { name: '保存设置' }).click();
    await options.waitForFunction(() => document.getElementById('saved').textContent.startsWith('已保存'));
    await t.test('设置页通过真实原生连接读取并保存设置', () => {
      assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).naming, 'platform_id');
    });

    let pageHtml = '<h1>P1001 A+B Problem</h1><p>时间限制：1 s<br>内存限制：128 MB</p>';
    await context.route('https://www.luogu.com.cn/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="zh-CN"><head><title>P1001 - 洛谷</title></head><body>${pageHtml}</body></html>` }));
    const page = await context.newPage();
    await page.goto('https://www.luogu.com.cn/problem/P1001');
    await page.waitForSelector('#oj-bridge-root');
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('https://www.luogu.com.cn/problem/P1001')).id);
    const act = action => worker.evaluate(async ({ tabId, action }) => chrome.tabs.sendMessage(tabId, { action: 'popupAction', operation: action }), { tabId, action });
    const opened = await act('open');
    await t.test('题目工具条调用 Native Messaging 创建正确 C++ 文件', () => {
      assert.equal(opened.ok, true, opened.error); assert.equal(opened.created, true);
      assert.equal(path.basename(opened.path), 'Luogu_P1001.cpp');
      const source = fs.readFileSync(opened.path, 'utf8'); assert.match(source, /#include<bits\/stdc\+\+\.h>/); assert.match(source, /题号：P1001/);
    });
    for (let i = 0; i < 30 && !fs.existsSync(record); i++) await delay(100);
    await t.test('原生启动的 Code 进程在请求结束后继续运行，并收到工作区与文件路径', () => {
      assert.ok(fs.existsSync(record), 'Code child did not survive native host exit');
      const command = fs.readFileSync(record, 'utf16le'); assert.ok(command.includes('--reuse-window')); assert.ok(command.includes(codeRoot)); assert.ok(command.includes(opened.path));
    });
    const code = '#include<bits/stdc++.h>\nusing namespace std;\nint main(){ cout << 42 << endl; return 0; }\n';
    fs.writeFileSync(opened.path, code);
    const reopened = await act('open'); assert.equal(reopened.created, false); assert.equal(fs.readFileSync(opened.path, 'utf8'), code);
    const copied = await act('copy'); assert.equal(copied.ok, true, copied.error);
    // Real content toolbar + authenticated bridge + MAIN-world textarea fill.
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<textarea name="sourceCode" style="display:block;width:400px;height:150px"></textarea>'); });
    const filledPromise = act('fill');
    const filled = await filledPromise;
    if (filled.navigating) await page.waitForFunction(code => document.querySelector('textarea[name="sourceCode"]')?.value === code, code, { timeout: 10000 });
    const resultAfterNavigation = await act('fill');
    await t.test('同一题重复打开不覆盖、复制和 textarea 回填保留完整代码', async () => {
      assert.equal(resultAfterNavigation.ok, true, resultAfterNavigation.error);
      assert.equal(await page.locator('textarea[name=sourceCode]').inputValue(), code);
    });
    await page.screenshot({ path: path.join(WORK, 'toolbar.png'), fullPage: true });

    const testPage = await context.newPage();
    // No content script is loaded for this fixture origin; editor.js itself is tested directly.
    await context.route('https://fixture.example/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
    const editorScript = path.join(ROOT, 'extension/editor.js');
    const taskOptions = { platform: 'AtCoder', id: 'abc425_a', url: 'https://atcoder.jp/contests/abc425/tasks/abc425_a' };
    const baseForm = '<form id="submit-form"><select id="select-task" name="data.TaskScreenName"><option value="abc425_b">B</option><option value="abc425_a">A</option></select><select id="select-lang" name="data.LanguageId"><option value="py">Python</option><option value="cpp17">C++17 (GCC)</option><option value="cpp20">C++20 (GCC)</option></select><button id="submit" type="submit">Submit</button></form>';
    await t.test('AtCoder 模拟页面：从题目跳转到提交页并自动填入、提交一次', async () => {
      await context.route('https://atcoder.jp/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: route.request().url().includes('/tasks/') ? '<!doctype html><h1 class="h2">A - Sigma Cubes</h1>' : `<!doctype html>${baseForm}<textarea name="sourceCode" style="height:150px;width:400px"></textarea><script>window.syntheticSubmissions=0;document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.syntheticSubmissions++;});</script>` }));
      const atcoder = await context.newPage(); await atcoder.goto(taskOptions.url); await atcoder.waitForSelector('#oj-bridge-root');
      const id = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url).id, taskOptions.url);
      const run = operation => worker.evaluate(async ({id,operation}) => chrome.tabs.sendMessage(id,{action:'popupAction',operation}), {id,operation});
      const source = await run('open'); assert.equal(source.ok,true,source.error); fs.writeFileSync(source.path,code);
      const response = await run('submit'); assert.equal(response.ok,true,response.error); assert.equal(response.navigating,true);
      await atcoder.waitForFunction(() => window.syntheticSubmissions === 1, null, {timeout:12000});
      assert.equal(await atcoder.locator('textarea').inputValue(),code); assert.equal(await atcoder.locator('#select-task').inputValue(),'abc425_a');
      assert.equal(await atcoder.locator('#select-lang').inputValue(),'cpp20');
    });
    await t.test('曙梦/Hydro 官方模板样本：无 action 的原生提交表单', async () => {
      const form = '<div name="submit_section"><form method="post"><div hidden><select name="lang"><option value="py">Python</option><option value="cpp20">C++20</option></select></div><textarea name="code" style="width:400px;height:150px"></textarea><input type="submit" value="Submit"></form></div><script>window.syntheticSubmissions=0;document.querySelector("form").addEventListener("submit",e=>{e.preventDefault();window.syntheticSubmissions++;});</script>';
      await context.route('https://oj.shumeng.tech/**', route => route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().endsWith('/submit')?'<!doctype html><h1>提交评测</h1>'+form:'<!doctype html><h1>CSP202609B 测试题目</h1>'}));
      const shumeng=await context.newPage();await shumeng.goto('https://oj.shumeng.tech/p/CSP202609B');await shumeng.waitForSelector('#oj-bridge-root');
      const id=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://oj.shumeng.tech/p/CSP202609B').id);
      const run=operation=>worker.evaluate(async({id,operation})=>chrome.tabs.sendMessage(id,{action:'popupAction',operation}),{id,operation});
      const source=await run('open');assert.equal(source.ok,true,source.error);fs.writeFileSync(source.path,code);
      const response=await run('submit');assert.equal(response.ok,true,response.error);assert.equal(response.navigating,true);
      await shumeng.waitForFunction(()=>window.syntheticSubmissions===1,null,{timeout:12000});
      assert.equal(await shumeng.locator('textarea').inputValue(),code);assert.equal(await shumeng.locator('select').inputValue(),'cpp20');
    });
    async function fixture(html, setup) {
      await testPage.goto('https://fixture.example/editor'); await testPage.setContent(baseForm + html);
      await testPage.evaluate(() => { globalThis.submitCount = 0; document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); globalThis.submitCount++; }); });
      if (setup) await testPage.evaluate(setup);
      await testPage.addScriptTag({ path: editorScript });
    }
    const apply = submit => testPage.evaluate(async ({ code, problem, submit }) => OJBridgeEditor.apply(code, { problem, submit, pageUrl: location.href }), { code, problem: taskOptions, submit });
    await t.test('textarea：选对题号和 C++20，核对内容后只提交一次', async () => {
      await fixture('<textarea name="sourceCode" style="width:400px;height:100px"></textarea>');
      const result = await apply(true); assert.equal(result.ok, true, result.error); assert.equal(result.submitted, true);
      assert.equal(await testPage.evaluate(() => submitCount), 1); assert.equal(await testPage.locator('#select-task').inputValue(), 'abc425_a');
      assert.equal(await testPage.locator('#select-lang').inputValue(), 'cpp20'); assert.equal(await testPage.locator('textarea').inputValue(), code);
    });
    for (const kind of ['Monaco', 'Ace', 'CodeMirror 5', 'CodeMirror 6']) await t.test(`${kind}：调用页面编辑器并回读验证`, async () => {
      await fixture(kind === 'Monaco' ? '<div class="monaco-editor" style="height:100px">editor</div>' : kind === 'Ace' ? '<div class="ace_editor" style="height:100px">editor</div>' : kind === 'CodeMirror 5' ? '<div class="CodeMirror" style="height:100px">editor</div>' : '<div class="cm-editor" style="height:100px"><div class="cm-content"></div></div>');
      await testPage.evaluate(kind => {
        let value = ''; const model = { setValue(v) { value = v; }, getValue() { return value; }, isDisposed() { return false; } };
        if (kind === 'Monaco') globalThis.monaco = { editor: { getModels: () => [model] } };
        if (kind === 'Ace') globalThis.ace = { edit: () => model };
        if (kind === 'CodeMirror 5') document.querySelector('.CodeMirror').CodeMirror = model;
        if (kind === 'CodeMirror 6') {
          const view = { state: { doc: { length: 0, toString() { return value; } } }, dispatch(t) { value = t.changes.insert; } };
          document.querySelector('.cm-content').cmView = { view };
        }
      }, kind);
      const result = await apply(false); assert.equal(result.ok, true, result.error); assert.equal(result.editor, kind);
    });
    await t.test('多个 Monaco 模型不强行覆盖', async () => {
      await fixture('<div class="monaco-editor" style="height:100px">editor</div>', () => { globalThis.monaco = { editor: { getModels: () => [{ setValue() {} }, { setValue() {} }] } }; });
      const result = await apply(false); assert.equal(result.ok, false); assert.match(result.error, /多个 Monaco/);
    });
    await t.test('不能确认 C++ 语言时填入代码但不提交', async () => {
      await fixture('<textarea name="sourceCode" style="height:100px"></textarea>');
      await testPage.locator('#select-lang').evaluate(e => e.remove());
      const result = await apply(true); assert.equal(result.ok, false); assert.match(result.error, /C\+\+ 语言/); assert.equal(await testPage.evaluate(() => submitCount), 0);
    });
    await t.test('题号不存在时不提交', async () => {
      await fixture('<textarea name="sourceCode" style="height:100px"></textarea>');
      await testPage.locator('#select-task').evaluate(e => e.remove());
      const result = await apply(true); assert.equal(result.ok, false); assert.match(result.error, /题号/); assert.equal(await testPage.evaluate(() => submitCount), 0);
    });
    await t.test('没有唯一编辑器时提示复制', async () => {
      await fixture('<p>editor loading</p>'); const result = await apply(false); assert.equal(result.ok, false); assert.match(result.error, /复制代码/);
    });
    await t.test('本地源文件按可分享的 VS Code 示例任务输出到 exe 文件夹', () => {
      const outputDir = path.join(codeRoot, 'exe'); fs.mkdirSync(outputDir, { recursive: true });
      const tasks = JSON.parse(fs.readFileSync(path.join(ROOT,'examples/vscode/tasks.json'), 'utf8'));
      const compile = tasks.tasks.find(task => task.group?.isDefault);
      const expand = s => s.replaceAll('${workspaceFolder}', codeRoot).replaceAll('${fileBasenameNoExtension}', path.parse(opened.path).name).replaceAll('${file}', opened.path).replaceAll('${fileDirname}',path.dirname(opened.path));
      execFileSync(CXX_PATH, compile.args.map(expand), { cwd: expand(compile.options.cwd), env, timeout: 30000 });
      const exe = path.join(outputDir, 'Luogu_P1001.exe');
      assert.equal(execFileSync(exe, [], { env: { ...env, PATH: path.dirname(CXX_PATH)+path.delimiter+env.PATH }, encoding: 'utf8' }).trim(), '42');
      assert.equal(fs.readdirSync(codeRoot).filter(name => name.endsWith('.exe')).length, 0);
    });
    await options.screenshot({ path: path.join(WORK, 'options.png'), fullPage: true });
  } finally {
    if (context) await context.close();
    try { py([path.join(ROOT, 'native/setup.py'), 'uninstall', '--target', install]); }
    finally {
      py(['-c', `import winreg,json,sys
data=json.load(open(sys.argv[1],encoding='utf-8'))
for name,value in data.items():
 if value is None:
  try:winreg.DeleteKey(winreg.HKEY_CURRENT_USER,name)
  except FileNotFoundError:pass
 else:
  with winreg.CreateKey(winreg.HKEY_CURRENT_USER,name) as key:winreg.SetValueEx(key,'',0,winreg.REG_SZ,value)`, registryBackup]);
    }
  }
});
