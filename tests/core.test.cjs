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
  ['https://leetcode.cn/problems/two-sum/description/?envType=study-plan-v2', 'LeetCodeCN', 'two-sum', 'https://leetcode.cn/problems/two-sum'],
  ['https://www.leetcode.com/problems/two-sum/solutions/', 'LeetCode', 'two-sum', 'https://leetcode.com/problems/two-sum'],
  ['https://leetcode.cn/problems/lru-cache/', 'LeetCodeCN', 'lru-cache', 'https://leetcode.cn/problems/lru-cache'],
  ['https://leetcode.com/contest/weekly-contest-400/problems/two-sum/', 'LeetCode', 'two-sum', 'https://leetcode.com/problems/two-sum'],
];
for (const [url, platform, id, canonical] of fixtures) test(`识别 ${platform} ${id}`, () => {
  const result = core.parseUrl(url); assert.equal(result.platform, platform); assert.equal(result.id, id); assert.equal(result.url, canonical);
  assert.ok(core.isSubmitFor(result.submitUrl, result));
});

test('力扣子页面和比赛链接保持同一题目身份，中英文站独立', () => {
  const p = core.parseUrl('https://leetcode.cn/problems/two-sum/');
  for (const url of ['https://leetcode.cn/problems/two-sum/description/', 'https://leetcode.cn/problems/two-sum/submissions/', 'https://leetcode.cn/contest/weekly-contest-400/problems/two-sum/']) assert.equal(core.isSubmitFor(url,p),true);
  for (const url of ['https://leetcode.com/problems/two-sum/', 'https://leetcode.cn/problems/lru-cache/', 'https://leetcode.cn.evil.test/problems/two-sum/', 'https://leetcode.cn/submissions/detail/123/', 'https://leetcode.cn/problems/', 'https://leetcode.cn/problems/two-sum/solutions/123/answer/']) assert.equal(core.isSubmitFor(url,p),false);
  assert.equal(p.canSubmit,false);
});

test('力扣官方模板按 C++ 语言和 slug 校验，保留设计题类名', () => {
  const problem=core.parseUrl('https://leetcode.cn/problems/lru-cache/');
  const data={data:{question:{titleSlug:'lru-cache',questionFrontendId:'146',title:'LRU Cache',translatedTitle:'LRU 缓存',codeSnippets:[{langSlug:'python3',code:'class LRUCache:'},{langSlug:'cpp',code:'class LRUCache {};'}]}}};
  assert.deepEqual(core.leetCodeMetadata(data,problem),{title:'LRU 缓存',frontendId:'146',starterCode:'class LRUCache {};'});
  assert.throws(()=>core.leetCodeMetadata(data,core.parseUrl('https://leetcode.cn/problems/two-sum/')),/不一致/);
  for (const code of ['', 'x'.repeat(32769), '\0bad']) assert.throws(()=>core.leetCodeMetadata({data:{question:{...data.data.question,codeSnippets:[{langSlug:'cpp',code}]}}},problem),/C\+\+/);
  assert.throws(()=>core.leetCodeMetadata({data:{question:{...data.data.question,codeSnippets:[{langSlug:'java',code:'class X {}'}]}}},problem),/C\+\+/);
});

test('力扣标题可从文档标题解析中文和英文', () => {
  for (const [host,title,expected] of [['leetcode.cn','1. 两数之和 - 力扣（LeetCode）','两数之和'],['leetcode.com','Two Sum - LeetCode','Two Sum']]) {
    assert.equal(core.readProblem({title,querySelector(){return null;},body:{innerText:''}},`https://${host}/problems/two-sum/`).title,expected);
  }
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
