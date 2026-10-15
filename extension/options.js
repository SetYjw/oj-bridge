'use strict';
const byId = id => document.getElementById(id);
async function check() {
  byId('check').disabled = true; byId('connection').textContent = '正在检测…';
  try {
    const response = await chrome.runtime.sendMessage({ action: 'ping' });
    if (!response?.ok) throw new Error(response?.error || '连接失败。');
    for (const name of ['root', 'naming', 'template']) byId(name).value = response.settings[name];
    byId('fields').disabled = false;
    byId('connection').textContent = `已连接 · Python ${response.python} · 本地程序 ${response.version}${response.codeFound ? ' · VS Code 已找到' : ' · 未找到 VS Code，请重新安装连接程序'}`;
  } catch (error) { byId('connection').textContent = error.message; byId('fields').disabled = true; }
  finally { byId('check').disabled = false; }
}
byId('check').addEventListener('click', check);
byId('settings').addEventListener('submit', async event => {
  event.preventDefault(); byId('saved').textContent = '正在保存…';
  const settings = Object.fromEntries(['root', 'naming', 'template'].map(name => [name, byId(name).value]));
  try {
    const response = await chrome.runtime.sendMessage({ action: 'configure', settings });
    if (!response?.ok) throw new Error(response?.error || '保存失败。');
    byId('saved').textContent = '已保存。刷新题目页面后使用。';
  } catch (error) { byId('saved').textContent = error.message; }
});
byId('identity').textContent = `扩展 ID：${chrome.runtime.id}。只读取已保存的 .cpp；不创建虚拟环境、不开放本地端口。`;
check();
