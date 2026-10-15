'use strict';
let tabId;
const buttons = [...document.querySelectorAll('[data-action]')];
const status = document.getElementById('status');
buttons.forEach(button => {
  button.disabled = true;
  button.addEventListener('click', async () => {
    buttons.forEach(b => b.disabled = true); status.textContent = '正在操作…';
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'popupAction', operation: button.dataset.action });
      status.textContent = response?.ok ? '操作已完成，请查看网页工具条。' : (response?.error || '请到题目页面重试。');
    } catch { status.textContent = '请刷新题目页面后重试。'; }
    finally { buttons.forEach(b => b.disabled = false); }
  });
});
document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = tab.id;
    const result = await chrome.tabs.sendMessage(tabId, { action: 'popupContext' });
    if (!result?.problem) throw new Error('请先打开已支持 OJ 的题目页面。');
    document.getElementById('problem').textContent = `${result.problem.label} · ${result.problem.id}\n${result.problem.title}`;
    buttons.forEach(b => b.disabled = false);
    document.querySelector('[data-action="submit"]').hidden = !result.problem.canSubmit;
  } catch { document.getElementById('problem').textContent = '当前页面未识别为题目。请打开题目并刷新一次，再点击本扩展。'; }
})();
