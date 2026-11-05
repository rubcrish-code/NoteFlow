// QA-only instrumentation. It never dispatches input or changes editor content.
export function installInputLatencyProbe() {
  if (window.inputLatencyProbe) throw new Error('Probe already installed');
  const editor = document.querySelector('.tiptap')?.editor;
  if (!editor) throw new Error('Editor is not ready');
  const data = window.inputLatencyProbe = { phase: 'setup', events: [], transactions: [], search: [], html: [], worker: [], ipc: [], longTasks: [] };
  let event, keyAt, activeSearch;
  const now = () => performance.now();
  const begin = (start, trusted, kind) => {
    const record = { phase: data.phase, start, trusted, kind };
    data.events.push(record); event = record;
    requestAnimationFrame(() => { record.raf1 = now() - start; requestAnimationFrame(() => { record.raf2 = now() - start; }); });
    return record;
  };
  document.addEventListener('keydown', e => {
    if (!e.target.closest?.('.tiptap') || ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    keyAt = now();
    const record = begin(keyAt, e.isTrusted, 'key');
    record.key = e.key.length === 1 ? 'character' : e.key;
    record.modified = e.ctrlKey || e.metaKey || e.altKey;
  }, true);
  document.addEventListener('beforeinput', e => {
    if (!e.target.closest?.('.tiptap')) return;
    const time = now();
    if (!event || event.phase !== data.phase || event.inputAt !== undefined || time - event.start > 1000) begin(time, e.isTrusted, 'input-only');
    event.inputAt = time; event.inputType = e.inputType; event.inputLength = e.data?.length ?? 0;
    event.keyToBeforeInput = keyAt === undefined ? undefined : time - keyAt;
  }, true);
  document.addEventListener('input', e => {
    if (e.target.closest?.('.tiptap') && event) event.inputEventAt = now() - event.start;
  }, true);
  document.addEventListener('paste', e => { if (e.target.closest?.('.tiptap') && event) event.paste = true; }, true);
  new MutationObserver(records => {
    if (!event || now() - event.start > 1000) return;
    event.mutations = (event.mutations ?? 0) + records.length;
    event.domReady = now() - event.start;
    if (event.inputAt !== undefined) event.inputToDom = now() - event.inputAt;
  }).observe(editor.view.dom, { subtree: true, childList: true, characterData: true, attributes: true });
  const dispatch = editor.view.dispatch.bind(editor.view);
  editor.view.dispatch = tr => {
    const t = now();
    try { return dispatch(tr); }
    finally {
      const end = now();
      data.transactions.push({ phase: data.phase, changed: tr.docChanged, ms: end - t });
      if (tr.docChanged && event && end - event.start < 1000) {
        event.dispatchReady = end - event.start;
        if (event.inputAt !== undefined) event.inputToDispatch = end - event.inputAt;
      }
    }
  };
  const search = editor.state.plugins.find(p => p.key.startsWith('note-search$'));
  if (search) {
    // EditorState binds spec.apply at configuration time; patching spec.apply
    // alone would collect zero samples while pretending to profile the plugin.
    const field = editor.state.config.fields.find(field => field.name === search.key);
    const apply = field.apply;
    field.apply = function (...args) {
      const entry = { phase: data.phase, changed: args[0].docChanged, scans: 0, characters: 0, decorations: 0 };
      const t = now(); activeSearch = entry;
      try { return apply.apply(this, args); }
      finally { entry.ms = now() - t; activeSearch = undefined; data.search.push(entry); }
    };
    const matchAll = String.prototype.matchAll;
    String.prototype.matchAll = function (...args) {
      if (activeSearch) { activeSearch.scans++; activeSearch.characters += this.length; }
      return matchAll.apply(this, args);
    };
    const state = search.getState(editor.state), Type = state.decorations.constructor;
    const create = Type.create;
    Type.create = function (doc, decorations, ...rest) {
      if (activeSearch) activeSearch.decorations += decorations.length;
      return create.call(this, doc, decorations, ...rest);
    };
    const add = Type.prototype.add;
    Type.prototype.add = function (doc, decorations, ...rest) {
      if (activeSearch) activeSearch.decorations += decorations.length;
      return add.call(this, doc, decorations, ...rest);
    };
  }
  if (editor.getHTML) {
    const getHTML = editor.getHTML.bind(editor);
    editor.getHTML = (...args) => { const t = now(); try { return getHTML(...args); } finally { data.html.push({ phase: data.phase, ms: now() - t }); } };
  }
  const post = Worker.prototype.postMessage;
  const pending = new WeakMap();
  Worker.prototype.postMessage = function (message, ...rest) {
    let jobs = pending.get(this);
    if (!jobs) { jobs = new Map(); pending.set(this, jobs); this.addEventListener('message', e => { const job = jobs.get(e.data?.id); if (job) { data.worker.push({ phase: job.phase, ms: now() - job.start }); jobs.delete(e.data.id); } }); }
    jobs.set(message?.id, { phase: data.phase, start: now() });
    return post.call(this, message, ...rest);
  };
  new PerformanceObserver(list => data.longTasks.push(...list.getEntries().map(e => ({ phase: data.phase, ms: e.duration })))).observe({ type: 'longtask' });
  // SDK invoke may already be a captured reference. Record whether interception
  // actually sees persistence; no response body or arguments are retained.
  const api = window.__TAURI_INTERNALS__;
  if (api?.invoke) {
    const invoke = api.invoke.bind(api);
    api.invoke = (command, ...args) => {
      const t = now(), phase = data.phase;
      const result = invoke(command, ...args);
      if (command === 'update_note_content') void result.then(() => data.ipc.push({ phase, ms: now() - t, ok: true }), () => data.ipc.push({ phase, ms: now() - t, ok: false }));
      return result;
    };
  }
  return { plugins: editor.state.plugins.map(p => p.key), paragraphs: editor.state.doc.childCount, characters: editor.state.doc.textContent.length, visibility: document.visibilityState, devicePixelRatio };
}

export function readInputLatencyProbe() {
  const editor = document.querySelector('.tiptap')?.editor;
  return { ...window.inputLatencyProbe, visibility: document.visibilityState, focused: document.hasFocus(), editorFocused: editor?.view.hasFocus(), selection: editor ? { from:editor.state.selection.from,to:editor.state.selection.to } : null, characters:editor?.state.doc.textContent.length, paragraphs:editor?.state.doc.childCount, heap: performance.memory?.usedJSHeapSize };
}
