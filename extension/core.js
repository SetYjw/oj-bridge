(function (global) {
  'use strict';
  const labels = { Luogu: '洛谷', Shumeng: '曙梦', AtCoder: 'AtCoder', Codeforces: 'Codeforces', NowCoder: '牛客竞赛', LibreOJ: 'LibreOJ', Hydro: 'Hydro' };
  const direct = new Set(['AtCoder', 'Codeforces', 'Shumeng', 'Hydro']);
  function parseUrl(raw) {
    let u; try { u = new URL(raw); } catch { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    let platform, id, submitUrl, path, m;
    let host = u.hostname.toLowerCase();
    const p = u.pathname.replace(/\/$/, '');
    if (['www.luogu.com.cn', 'www.luogu.com', 'luogu.com.cn', 'luogu.com'].includes(host) && (m = p.match(/^\/problem\/([\w-]+)(?:\/submit)?$/))) {
      platform = 'Luogu'; id = m[1]; host = 'www.luogu.com.cn'; path = `/problem/${id}`;
      submitUrl = `https://${host}${path}#submit`;
    } else if (host === 'oj.shumeng.tech' && (m = p.match(/^\/p\/([\w-]+)(?:\/submit)?$/))) {
      platform = 'Shumeng'; id = m[1]; path = `/p/${id}`; submitUrl = `https://${host}${path}/submit`;
    } else if (host === 'atcoder.jp' && (m = p.match(/^\/contests\/([\w-]+)\/tasks\/([\w-]+)$/))) {
      platform = 'AtCoder'; id = m[2]; path = `/contests/${m[1]}/tasks/${id}`;
      submitUrl = `https://${host}/contests/${m[1]}/submit?taskScreenName=${encodeURIComponent(id)}`;
    } else if (['codeforces.com', 'www.codeforces.com', 'm1.codeforces.com', 'm2.codeforces.com', 'm3.codeforces.com'].includes(host) && (m = p.match(/^\/(contest|gym)\/(\d+)\/problem\/([a-z][a-z0-9]*)$/i) || p.match(/^\/problemset\/problem\/(\d+)\/([a-z][a-z0-9]*)$/i))) {
      let kind, contest, index;
      if (m.length === 4) [, kind, contest, index] = m;
      else { kind = 'contest'; [, contest, index] = m; }
      platform = 'Codeforces'; id = `${contest}_${index.toUpperCase()}`; host = 'codeforces.com'; path = `/${kind}/${contest}/problem/${index.toUpperCase()}`;
      submitUrl = `https://${host}/${kind}/${contest}/submit/problemIndex/${index.toUpperCase()}`;
    } else if (['ac.nowcoder.com', 'www.nowcoder.com'].includes(host) && (m = p.match(/^\/acm\/contest\/(\d+)\/([a-z][a-z0-9]*)$/i))) {
      platform = 'NowCoder'; id = `${m[1]}_${m[2].toUpperCase()}`; host = 'ac.nowcoder.com'; path = `/acm/contest/${m[1]}/${m[2].toUpperCase()}`;
      submitUrl = `https://${host}${path}`;
    } else if (['loj.ac', 'www.loj.ac'].includes(host) && (m = p.match(/^\/p\/(\d+)(?:\/submit)?$/))) {
      platform = 'LibreOJ'; id = m[1]; host = 'loj.ac'; path = `/p/${id}`; submitUrl = `https://${host}${path}#submit`;
    } else if ((['hydro.ac', 'hydrooj.com'].includes(host) || host.endsWith('.hydro.ac') || host.endsWith('.hydrooj.com')) && (m = p.match(/^(\/d\/[\w-]+)?\/p\/([\w-]+)(?:\/submit)?$/))) {
      platform = 'Hydro'; id = m[1] ? `${m[1].slice(3)}_${m[2]}` : m[2]; path = `${m[1] || ''}/p/${m[2]}`;
      submitUrl = `https://${host}${path}/submit`;
    }
    return platform ? { platform, id, url: `https://${host}${path}`, submitUrl, label: labels[platform], canSubmit: direct.has(platform) } : null;
  }
  function isSubmitFor(raw, problem) {
    if (!problem || !parseUrl(problem.url)) return false;
    let page, expected; try { page = new URL(raw); expected = new URL(problem.submitUrl || parseUrl(problem.url).submitUrl); } catch { return false; }
    if (page.origin !== expected.origin || page.username || page.password) return false;
    if (problem.platform === 'AtCoder') {
      const task = page.searchParams.get('taskScreenName');
      return page.pathname === expected.pathname && (!task || task === problem.id);
    }
    if (problem.platform === 'Codeforces') return page.pathname.replace(/\/$/, '') === expected.pathname || page.pathname === expected.pathname.split('/problemIndex/')[0];
    return page.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '');
  }
  function readProblem(document, raw) {
    const info = parseUrl(raw); if (!info) return null;
    const selectors = {
      Luogu: ['h1', '.problem-title'], Shumeng: ['h1', '.section__title'],
      AtCoder: ['#main-container .h2', '.h2'], Codeforces: ['.problem-statement .title'],
      NowCoder: ['.subject-item-title', '.subject-title', 'h1'], LibreOJ: ['h1', '.problem-title'], Hydro: ['h1', '.section__title']
    };
    let title = '';
    for (const selector of selectors[info.platform]) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        const copy = element.cloneNode?.(true);
        if (copy) copy.querySelectorAll('button, .btn, small, .label, .badge, script, style').forEach(e => e.remove());
        title = (copy || element).textContent.trim(); break;
      }
    }
    title ||= document.title;
    title = title.replace(/\s+/g, ' ').replace(/\s*[-|－]\s*(洛谷|Luogu|AtCoder|Hydro|曙梦.*|LibreOJ|Codeforces).*$/i, '').trim();
    const escapedId = info.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp(`^${escapedId}(?:\\s+|[.：:]\\s*)`, 'i'), '');
    if (['AtCoder', 'Codeforces', 'NowCoder'].includes(info.platform)) title = title.replace(/^[A-Z][A-Z0-9]*\s*[.\-－]\s*/, '');
    // Prefer a short title over accidentally consuming an entire application header.
    info.title = title.slice(0, 180) || info.id;
    const text = (document.body?.innerText || document.querySelector('.problem-statement, #task-statement, .problem-content, .section__body')?.textContent || '').slice(0, 20000);
    info.timeLimit = text.match(/(?:Time Limit|time limit per test|时间限制|时限)\s*[:：]?\s*([^\n]{1,60})/i)?.[1]?.trim() || '';
    info.memoryLimit = text.match(/(?:Memory Limit|memory limit per test|内存限制|内存)\s*[:：]?\s*([^\n]{1,60})/i)?.[1]?.trim() || '';
    info.timeLimit = info.timeLimit.split(/\s*\/\s*Memory Limit|\s*内存限制/i)[0].trim();
    return info;
  }
  const api = { parseUrl, isSubmitFor, readProblem, labels, direct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.OJCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
