/* Runs only when requested, in the page's MAIN world. No remote scripts. */
(function (global) {
  'use strict';
  function visible(element) {
    return Boolean(element && !element.disabled && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none');
  }
  const normalize = value => String(value).replace(/\r\n/g, '\n');
  function setInput(element, value) {
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value); else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const isLeetCode = problem => ['LeetCode', 'LeetCodeCN'].includes(problem?.platform);
  function leetCodeEditors() {
    return (global.monaco?.editor?.getEditors?.() || []).filter(editor =>
      visible(editor.getDomNode?.()) && !editor.getRawOptions?.().readOnly && editor.getModel?.()?.getLanguageId?.() === 'cpp');
  }
  function chooseLanguage(problem) {
    // LeetCode uses a custom language menu and also mounts testcase editors.
    // Confirm the actual source model instead of guessing from button text.
    if (isLeetCode(problem)) return leetCodeEditors().length === 1;
    const select = [...document.querySelectorAll('#select-lang, #select-language, select[name="data.LanguageId"], select[name="language_id"], select[name="languageId"], select[name="programTypeId"], select[name="language"], select[name="lang"]')].find(e => e.tagName === 'SELECT' && !e.disabled);
    if (!select) return false;
    const options = [...select.options].filter(o => !o.disabled && /(?:C\+\+|GNU\+\+|G\+\+)/i.test(o.textContent));
    const rank = o => /(?:20|2a)\b/.test(o.textContent) ? 3 : /17\b/.test(o.textContent) ? 2 : 1;
    options.sort((a, b) => rank(b) - rank(a));
    if (!options.length) return false;
    setInput(select, options[0].value);
    return /(?:C\+\+|GNU\+\+|G\+\+)/i.test(select.selectedOptions[0]?.textContent || '');
  }
  function checkTask(problem) {
    if (isLeetCode(problem)) {
      const original = new URL(problem.url);
      const match = location.pathname.replace(/\/$/, '').match(/^\/(?:contest\/[\w-]+\/)?problems\/([a-z0-9-]+)(?:\/(?:description|editorial|solutions|submissions))?$/);
      return location.origin === original.origin && match?.[1] === problem.id;
    }
    if (problem.platform === 'AtCoder') {
      const select = document.querySelector('#select-task, select[name="data.TaskScreenName"]');
      if (!select) return false;
      if (![...select.options].some(o => o.value === problem.id)) return false;
      if (select.value !== problem.id) setInput(select, problem.id);
      return select.value === problem.id;
    }
    if (problem.platform === 'Codeforces') {
      const index = problem.id.split('_').at(-1);
      const select = document.querySelector('select[name="submittedProblemIndex"]');
      if (!select) return false;
      const option = [...select.options].find(o => o.value.toUpperCase() === index);
      if (!option) return false;
      if (select.value !== option.value) setInput(select, option.value);
      return select.value.toUpperCase() === index;
    }
    const original = new URL(problem.url);
    return location.origin === original.origin && location.pathname.replace(/\/submit\/?$/, '').replace(/\/$/, '') === original.pathname;
  }
  function writeEditor(code, problem) {
    if (isLeetCode(problem)) {
      const editors = leetCodeEditors();
      if (editors.length !== 1) throw new Error('请先在力扣网页选择 C++，并只打开一个代码编辑区，再点击填入；也可以使用复制代码。');
      const editor = editors[0], model = editor.getModel();
      // An edit operation participates in Monaco undo and notifies the site's
      // normal change listeners, so its Run/Submit controls see the new source.
      editor.pushUndoStop?.();
      if (editor.executeEdits && model.getFullModelRange) editor.executeEdits('oj-bridge', [{ range: model.getFullModelRange(), text: code, forceMoveMarkers: true }]);
      else model.setValue(code);
      editor.pushUndoStop?.();
      return { kind: 'LeetCode Monaco', read: () => model.getValue() };
    }
    const monacoNodes = [...document.querySelectorAll('.monaco-editor')].filter(visible);
    if (monacoNodes.length && global.monaco?.editor) {
      const editors = global.monaco.editor.getEditors?.().filter(e => visible(e.getDomNode?.())) || [];
      const models = editors.length === 1 ? [editors[0].getModel()] : global.monaco.editor.getModels().filter(m => !m.isDisposed?.());
      if (models.length === 1 && models[0]) {
        models[0].setValue(code);
        return { kind: 'Monaco', read: () => models[0].getValue() };
      }
      if (models.length > 1) throw new Error('检测到多个 Monaco 文档，请在网页中选中要提交的编辑器后重试，或复制代码。');
    }
    const aceNodes = [...document.querySelectorAll('.ace_editor')].filter(visible);
    if (aceNodes.length === 1 && global.ace?.edit) {
      const editor = global.ace.edit(aceNodes[0]); editor.setValue(code, -1);
      return { kind: 'Ace', read: () => editor.getValue() };
    }
    const cmNodes = [...document.querySelectorAll('.CodeMirror')].filter(visible);
    if (cmNodes.length === 1 && cmNodes[0].CodeMirror) {
      const editor = cmNodes[0].CodeMirror; editor.setValue(code);
      return { kind: 'CodeMirror 5', read: () => editor.getValue() };
    }
    const cm6Nodes = [...document.querySelectorAll('.cm-editor')].filter(visible);
    if (cm6Nodes.length === 1) {
      const content = cm6Nodes[0].querySelector('.cm-content');
      const view = content?.cmView?.view || cm6Nodes[0].cmView?.view;
      if (view?.state?.doc && view.dispatch) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
        return { kind: 'CodeMirror 6', read: () => view.state.doc.toString() };
      }
    }
    // Never use Monaco's or Ace's invisible keyboard-capture textareas.
    const nodes = [...document.querySelectorAll('textarea[name="sourceCode"], textarea[name="source"], textarea[name="code"], textarea#sourceCode, textarea#source, textarea#code, textarea#editor, textarea#submission-code')]
      .filter(e => visible(e) && !e.closest('.monaco-editor, .ace_editor, .cm-editor, .CodeMirror'));
    if (nodes.length === 1) {
      setInput(nodes[0], code);
      return { kind: 'textarea', read: () => nodes[0].value };
    }
    throw new Error('未找到唯一可写的网页代码编辑器。请先打开提交/代码面板，再点“填入网页 IDE”，或直接复制代码。');
  }
  function submitButton(platform) {
    const selectors = {
      AtCoder: '#submit, form#submit-form button[type="submit"]',
      Codeforces: '#singlePageSubmitButton',
      Shumeng: '[name="submit_section"] > form button[type="submit"], [name="submit_section"] > form input[type="submit"], form[action$="/submit"] button[type="submit"], form[action$="/submit"] input[type="submit"]',
      Hydro: '[name="submit_section"] > form button[type="submit"], [name="submit_section"] > form input[type="submit"], form[action$="/submit"] button[type="submit"], form[action$="/submit"] input[type="submit"]'
    };
    return [...document.querySelectorAll(selectors[platform] || '[data-ojbridge-never-match]')].filter(visible);
  }
  async function apply(code, options) {
    try {
      if (location.href !== options.pageUrl) throw new Error('页面已变化，请在当前题目上重新操作。');
      if (typeof code !== 'string' || !code.trim()) throw new Error('源码为空，请先在 VS Code 保存。');
      const taskConfirmed = checkTask(options.problem);
      const languageConfirmed = chooseLanguage(options.problem);
      if (isLeetCode(options.problem) && !taskConfirmed) throw new Error('力扣题目已经变化，请在当前题目重新操作。');
      // Sites often recreate their editor when the language changes.
      await new Promise(resolve => setTimeout(resolve, 350));
      if (location.href !== options.pageUrl) throw new Error('页面已跳转，请重新操作。');
      const editor = writeEditor(code, options.problem);
      await new Promise(resolve => setTimeout(resolve, 150));
      if (normalize(editor.read()) !== normalize(code)) throw new Error('网页编辑器的内容未能保持一致，请使用复制代码。');
      if (!options.submit) return { ok: true, editor: editor.kind, submitted: false, languageConfirmed, message: `已填入 ${editor.kind}。请核对语言和题号后使用网页提交按钮。` };
      if (!taskConfirmed || !checkTask(options.problem)) throw new Error('代码已填入，但无法确认网页所选题号；请核对后手动提交。');
      if (!languageConfirmed) throw new Error('代码已填入，但无法确认 C++ 语言选项；请选择 C++ 后手动提交。');
      const buttons = submitButton(options.problem.platform);
      if (buttons.length !== 1) throw new Error('代码已填入，但未找到唯一提交按钮；请手动点击网页提交。');
      const form = buttons[0].form || buttons[0].closest('form');
      if (form) {
        const action = new URL(form.action || location.href, location.href);
        if (action.origin !== location.origin || form.querySelector('input[type="password"]')) throw new Error('代码已填入，请先在原网页完成登录并手动提交。');
      }
      if (location.href !== options.pageUrl || normalize(editor.read()) !== normalize(code)) throw new Error('页面或内容在提交前发生变化，已停止，请重新填入。');
      buttons[0].click();
      return { ok: true, editor: editor.kind, submitted: true, message: '已点击网页提交按钮。请以 OJ 页面显示的提交记录和评测结果为准。' };
    } catch (error) { return { ok: false, error: error.message }; }
  }
  global.OJBridgeEditor = { apply };
})(globalThis);
