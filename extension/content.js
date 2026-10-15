(function () {
  'use strict';
  if (globalThis.__ojBridgeContent) return;
  globalThis.__ojBridgeContent = true;
  let problem = null, currentUrl = '', titleSignature = '', container, shadow, status, title, buttons, lastScan = 0, busy = false;
  const send = message => chrome.runtime.sendMessage(message);
  function note(text, error = false) {
    if (!status) return;
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function fallbackCopy(code) {
    let panel = shadow.querySelector('.copy-panel');
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'copy-panel';
      const help = document.createElement('p'); help.textContent = '浏览器未允许自动复制。选中下方代码后按 Ctrl+C，再到网页 IDE 粘贴。';
      const input = document.createElement('textarea'); input.setAttribute('aria-label', '待复制的本地代码'); input.spellcheck = false;
      const close = document.createElement('button'); close.textContent = '收起代码'; close.addEventListener('click', () => panel.remove());
      panel.append(help, input, close); shadow.querySelector('.body').append(panel);
    }
    const area = panel.querySelector('textarea'); area.value = code; area.focus(); area.select();
  }
  async function perform(action) {
    if (!problem || busy) return { ok: false, error: '当前题目尚未就绪或操作进行中。' };
    if (action === 'settings') { await send({ action }); return { ok: true }; }
    busy = true;
    buttons.forEach(b => b.disabled = true);
    note(action === 'open' ? '正在准备源码并打开 VS Code…' : '正在读取已保存的源码…');
    try {
      const response = await send({ action, problem });
      if (!response?.ok) throw new Error(response?.error || '扩展没有返回结果。请刷新页面重试。');
      if (action === 'copy') {
        try { await navigator.clipboard.writeText(response.code); note(`已复制 ${response.path.split(/[\\/]/).pop()} 的已保存代码。`); }
        catch { fallbackCopy(response.code); note('请按 Ctrl+C 复制下方已选中的代码。'); }
      } else if (action === 'open') note(`${response.created ? '已创建' : '已打开已有文件'}：${response.path}。写完后请 Ctrl+S 保存。`);
      else note(response.message || '操作完成。');
      return response;
    } catch (error) {
      note(error.message, true); return { ok: false, error: error.message };
    } finally {
      busy = false; buttons.forEach(b => b.disabled = false);
      shadow.querySelector('[data-action="submit"]').hidden = !problem?.canSubmit;
    }
  }
  function build() {
    container = document.createElement('div'); container.id = 'oj-bridge-root';
    container.style.cssText = 'all:initial;position:fixed;right:16px;bottom:24px;z-index:2147483000;';
    shadow = container.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      :host{font:13px/1.55 "Segoe UI","Microsoft YaHei",sans-serif;color:#24344a;color-scheme:light}
      *{box-sizing:border-box}section{font:13px/1.55 "Segoe UI","Microsoft YaHei",sans-serif;color:#24344a;width:272px;background:#fff;border:1px solid #c3d3e4;border-radius:10px;box-shadow:0 6px 28px #153d6920;overflow:hidden}
      header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#edf5ff;border-bottom:1px solid #d9e5f1}strong{font-size:13px;color:#174b80;flex:1}button{font:inherit;cursor:pointer;border:1px solid #bfcede;border-radius:5px;background:#fff;color:#24537d;padding:7px 9px;text-align:center}button:hover{background:#eaf3fe}button:focus-visible,textarea:focus-visible{outline:3px solid #ee952c;outline-offset:2px}button:disabled{opacity:.6;cursor:wait}button[hidden]{display:none}
      header button{border:0;padding:0 5px;background:transparent;font-size:16px}.body{padding:12px}.title{white-space:pre-line;margin:0 0 10px;font-weight:600;overflow-wrap:anywhere;max-height:64px;overflow:auto}.actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.primary{grid-column:1/-1;background:#176cbe;color:#fff;border-color:#176cbe}.primary:hover{background:#125999}.submit{grid-column:1/-1}.hint{font-size:11px;color:#66788c;margin:10px 0 0}.status{font-size:12px;color:#285f44;margin:9px 0 0;overflow-wrap:anywhere;max-height:135px;overflow:auto}.status[data-error=true]{color:#a43d23}.settings{border:0;padding:4px 0;color:#65758a;font-size:11px;margin-top:7px;background:transparent}.copy-panel textarea{width:100%;height:180px;font:12px/1.5 Consolas,monospace}.copy-panel p{font-size:12px}.collapsed .body{display:none}.collapsed header{border:0}
      @media(max-width:500px){section{width:240px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
    </style><section aria-label="OJ Bridge 编程工具"><header><strong>OJ Bridge</strong><button class="collapse" aria-label="收起或展开工具条" title="收起或展开">−</button></header><div class="body"><p class="title"></p><div class="actions"><button class="primary" data-action="open">在 VS Code 编程</button><button data-action="fill">填入网页 IDE</button><button data-action="copy">复制代码</button><button class="submit" data-action="submit">填入并提交</button></div><p class="hint">读取已保存的 .cpp · 写完后先按 Ctrl+S</p><p class="status" role="status" aria-live="polite"></p><button class="settings" data-action="settings">设置与连接检测</button></div></section>`;
    status = shadow.querySelector('.status'); title = shadow.querySelector('.title'); buttons = [...shadow.querySelectorAll('[data-action]')];
    buttons.forEach(button => button.addEventListener('click', () => perform(button.dataset.action)));
    shadow.querySelector('.collapse').addEventListener('click', () => {
      const collapsed = shadow.querySelector('section').classList.toggle('collapsed');
      shadow.querySelector('.collapse').textContent = collapsed ? '+' : '−';
    });
    document.documentElement.append(container);
  }
  async function scan() {
    const signature = document.title + '|' + (document.querySelector('h1, .problem-statement .title, #main-container .h2, .subject-item-title')?.textContent || '');
    if (busy || (location.href === currentUrl && problem && signature === titleSignature)) return;
    const scannedUrl = location.href;
    currentUrl = scannedUrl;
    titleSignature = signature;
    const captured = OJCore.readProblem(document, scannedUrl);
    try {
      const result = await send({ action: 'context', problem: captured });
      if (location.href !== scannedUrl) return;
      if (!result?.ok) { if (container) container.style.display = 'none'; problem = null; return; }
      problem = result.problem;
      if (!container) build();
      container.style.display = 'block';
      title.textContent = `${problem.label} · ${problem.id}\n${problem.title}`;
      shadow.querySelector('[data-action="submit"]').hidden = !problem.canSubmit;
      note('准备就绪。首次使用请先检测连接。');
      // A navigation can leave the editor mounting after document_idle.
      await new Promise(resolve => setTimeout(resolve, 1600));
      if (location.href !== scannedUrl) return;
      const resumed = await send({ action: 'resume', problem });
      if (resumed && !resumed.idle) note(resumed.message || resumed.error, !resumed.ok);
    } catch (error) { note(`连接中断，请刷新页面：${error.message}`, true); }
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.action === 'popupContext') { respond({ ok: Boolean(problem), problem }); return; }
    if (message.action === 'popupAction') { perform(message.operation).then(respond); return true; }
  });
  setInterval(() => { const now = Date.now(); if (now - lastScan > 1200) { lastScan = now; scan(); } }, 1400);
  scan();
})();
