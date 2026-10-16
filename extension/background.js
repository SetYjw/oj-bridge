'use strict';
importScripts('core.js');
const HOST = 'com.ojbridge.native';
const busy = new Set();
const contextKey = id => `context:${id}`;
const pendingKey = id => `pending:${id}`;
function native(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST, message, response => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(`本地连接未就绪：${error.message}。请先运行 install.cmd，并在扩展设置中检测连接。`));
      if (!response?.ok) return reject(new Error(response?.error || '本地连接没有返回有效结果。'));
      resolve(response);
    });
  });
}
async function stored(key) { return (await chrome.storage.session.get(key))[key]; }
async function withLeetCodeStarter(problem) {
  if (!OJCore.isLeetCode(problem)) return problem;
  try {
    // Only public question metadata; never send account cookies or saved solutions.
    const response = await fetch(new URL('/graphql/', problem.url), {
      method: 'POST', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query ojBridgeStarter($titleSlug: String!) { question(titleSlug: $titleSlug) { titleSlug questionFrontendId title translatedTitle codeSnippets { langSlug code } } }', variables: { titleSlug: problem.id } })
    });
    if (!response.ok) throw new Error('无法读取力扣题目');
    return { ...problem, ...OJCore.leetCodeMetadata(await response.json(), problem) };
  } catch {
    // Existing files must still reopen during a network outage. The host requires
    // the official template only if it actually needs to create a new file.
    return problem;
  }
}
async function problemFor(sender, supplied) {
  if (!sender.tab || sender.frameId !== 0) throw new Error('请在题目的主页面操作。');
  const raw = sender.url || sender.tab.url;
  const parsed = OJCore.parseUrl(raw);
  if (parsed) {
    if (supplied && OJCore.parseUrl(supplied.url)?.url !== parsed.url) throw new Error('题目链接与当前页面不一致，请刷新后重试。');
    const old = await stored(contextKey(sender.tab.id));
    const onSubmitPage = /\/submit\/?$/.test(new URL(raw).pathname);
    const metadata = onSubmitPage && old?.problem?.url === parsed.url ? old.problem : supplied || (old?.problem?.url === parsed.url ? old.problem : {});
    const problem = { ...parsed, title: String(metadata.title || parsed.id).slice(0, 180), timeLimit: String(metadata.timeLimit || '').slice(0, 120), memoryLimit: String(metadata.memoryLimit || '').slice(0, 120) };
    await chrome.storage.session.set({ [contextKey(sender.tab.id)]: { problem, time: Date.now() } });
    return problem;
  }
  const context = await stored(contextKey(sender.tab.id));
  if (context && Date.now() - context.time < 12 * 60 * 60 * 1000 && OJCore.isSubmitFor(raw, context.problem)) return context.problem;
  throw new Error('当前页面不是已支持的题目或该题的提交页面。请先从题目正文点击“在 VS Code 编程”。');
}
async function fill(tabId, url, problem, submit) {
  const response = await native({ action: 'read', problem });
  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== url) throw new Error('页面已经变化，请重新点击填入。');
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'MAIN', files: ['editor.js'] });
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] }, world: 'MAIN',
    func: (code, options) => globalThis.OJBridgeEditor.apply(code, options),
    args: [response.code, { problem, submit, pageUrl: url }]
  });
  return results[0]?.result || { ok: false, error: '网页编辑器未返回结果，请使用复制代码。' };
}
async function handle(message, sender) {
  if (!message || typeof message.action !== 'string') throw new Error('请求无效。');
  const extensionPage = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
  if (message.action === 'settings') { await chrome.runtime.openOptionsPage(); return { ok: true }; }
  if (['ping', 'configure'].includes(message.action)) {
    if (!extensionPage) throw new Error('请从扩展设置页更改连接设置。');
    return native({ action: message.action, settings: message.settings });
  }
  // MessageSender.url can retain the document URL across hash / SPA navigation.
  // Read the actual tab URL before deciding whether another navigation is needed.
  if (sender.tab && sender.frameId === 0) {
    const tab = await chrome.tabs.get(sender.tab.id);
    if (!tab.url || new URL(tab.url).origin !== new URL(sender.url).origin) throw new Error('页面已跳转，请在当前题目重试。');
    sender = { ...sender, tab, url: tab.url };
  }
  const problem = await problemFor(sender, message.problem);
  const id = sender.tab.id;
  if (message.action === 'context') return { ok: true, problem };
  if (!['open', 'copy', 'fill', 'submit', 'resume'].includes(message.action)) throw new Error('未知操作。');
  // A document-ready probe with nothing to resume must not acquire the user-action lock.
  if (message.action === 'resume' && !await stored(pendingKey(id))) return { ok: true, idle: true };
  if (busy.has(id)) throw new Error('正在处理上一个操作，请稍候。');
  busy.add(id);
  try {
    if (message.action === 'open') return native({ action: 'open', problem: await withLeetCodeStarter(problem) });
    if (message.action === 'copy') return native({ action: 'read', problem });
    if (message.action === 'resume') {
      const pending = await stored(pendingKey(id));
      if (!pending) return { ok: true, idle: true };
      if (Date.now() - pending.time > 3 * 60 * 1000 || pending.problem.url !== problem.url) {
        await chrome.storage.session.remove(pendingKey(id));
        return { ok: false, error: '先前的填入请求已失效，请在当前题目重新点击。' };
      }
      if (!OJCore.isSubmitFor(sender.url, problem)) return { ok: true, idle: true };
      await chrome.storage.session.remove(pendingKey(id));
      return fill(id, sender.url, problem, pending.submit);
    }
    const submit = message.action === 'submit';
    if (submit && !problem.canSubmit) throw new Error('此平台暂提供填入和复制，请使用网页自身的提交按钮。');
    // Test/read first, so a missing file never causes an unexplained navigation.
    await native({ action: 'read', problem });
    const current = new URL(sender.url);
    const target = new URL(problem.submitUrl);
    const needsNavigation = !OJCore.isSubmitFor(sender.url, problem) ||
      (['Luogu', 'LibreOJ'].includes(problem.platform) && current.hash !== target.hash);
    if (needsNavigation) {
      await chrome.storage.session.set({ [pendingKey(id)]: { problem, submit, time: Date.now() } });
      await chrome.tabs.update(id, { url: problem.submitUrl });
      return { ok: true, navigating: true, message: '正在打开该题提交页面，加载后自动填入。若网页未展开编辑器，请展开后再点击填入。' };
    }
    return fill(id, sender.url, problem, submit);
  } finally { busy.delete(id); }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(id => {
  chrome.storage.session.remove([contextKey(id), pendingKey(id)]);
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#176cbe' });
});
