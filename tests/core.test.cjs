const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/core.js');
const fixtures = [
  ['https://www.luogu.com.cn/problem/P1001?x=1#submit', 'Luogu', 'P1001', 'https://www.luogu.com.cn/problem/P1001'],
  ['https://oj.shumeng.tech/p/CSP202609B/submit', 'Shumeng', 'CSP202609B', 'https://oj.shumeng.tech/p/CSP202609B'],
  ['https://atcoder.jp/contests/abc425/tasks/abc425_a?lang=en', 'AtCoder', 'abc425_a', 'https://atcoder.jp/contests/abc425/tasks/abc425_a'],
  ['https://codeforces.com/problemset/problem/2268/A', 'Codeforces', '2268_A', 'https://codeforces.com/contest/2268/problem/A'],
  ['https://codeforces.com/gym/123456/problem/A1', 'Codeforces', '123456_A1', 'https://codeforces.com/gym/123456/problem/A1'],
  ['https://ac.nowcoder.com/acm/contest/12345/A', 'NowCoder', '12345_A', 'https://ac.nowcoder.com/acm/contest/12345/A'],
  ['https://loj.ac/p/1000', 'LibreOJ', '1000', 'https://loj.ac/p/1000'],
  ['https://hydro.ac/d/test/p/P1000/submit', 'Hydro', 'test_P1000', 'https://hydro.ac/d/test/p/P1000'],
];
for (const [url, platform, id, canonical] of fixtures) test(`识别 ${platform} ${id}`, () => {
  const result = core.parseUrl(url); assert.equal(result.platform, platform); assert.equal(result.id, id); assert.equal(result.url, canonical);
  assert.ok(core.isSubmitFor(result.submitUrl, result));
});
test('拒绝伪装域名、非 HTTPS、凭据和非题目页', () => {
  for (const url of ['https://luogu.com.cn.evil.test/problem/P1','http://www.luogu.com.cn/problem/P1','https://a:b@www.luogu.com.cn/problem/P1','https://atcoder.jp/contests/abc425','https://www.luogu.com.cn:444/problem/P1','file:///tmp/example.cpp']) assert.equal(core.parseUrl(url), null, url);
});
test('拒绝其他题目的提交页面和其他域名', () => {
  const p = core.parseUrl('https://atcoder.jp/contests/abc425/tasks/abc425_a');
  assert.equal(core.isSubmitFor('https://atcoder.jp/contests/abc425/submit?taskScreenName=abc425_b', p), false);
  assert.equal(core.isSubmitFor('https://evil.test/contests/abc425/submit', p), false);
  assert.equal(core.isSubmitFor('https://atcoder.jp/contests/abc426/submit', p), false);
});
test('Codeforces 题库与比赛链接使用同一身份', () => {
  assert.equal(core.parseUrl('https://codeforces.com/problemset/problem/2268/A').url,core.parseUrl('https://codeforces.com/contest/2268/problem/A').url);
});
test('不将未适配的登录、记录页误认为题目', () => {
  for (const url of ['https://oj.shumeng.tech/login','https://loj.ac/record/123','https://atcoder.jp/login','https://hydro.ac/d/demo/p']) assert.equal(core.parseUrl(url),null);
});
test('题名使用文本且截断，保留 C++ 题目信息', () => {
  const document = {title:'fallback',querySelector(selector){if(selector==='h1')return {textContent:' P1001 A+B Problem - 洛谷 '};return null;},body:{innerText:'时间限制：1 s\n内存限制：128 MB'}};
  const result = core.readProblem(document,'https://www.luogu.com.cn/problem/P1001');
  assert.equal(result.title,'A+B Problem');assert.equal(result.timeLimit,'1 s');assert.equal(result.memoryLimit,'128 MB');
});
