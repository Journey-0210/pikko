import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('global import requires an explicit destination and folder imports keep their chosen destination', () => {
  const source = fs.readFileSync(new URL('../library.js', import.meta.url), 'utf8');
  let opens = 0, selects = 0, creates = 0;
  const handlers = {};
  const nodes = Object.fromEntries(['import-close', 'import-cancel', 'import-form', 'import-folder', 'import-dialog', 'import-button', 'empty-import', 'import-input'].map(id => [id, {
    value: '', focus() {}, close() {}, showModal() { opens++; }, click() { selects++; }, addEventListener(event, callback) { handlers[id + ':' + event] = callback; }
  }]));
  const state = { folders: [{ id: 'first' }, { id: 'chosen' }] }, view = { folderId: null };
  const context = vm.createContext({ $, state, view, importBusy: false, importFolderId: null, folderById: id => state.folders.find(f => f.id === id), toast() {}, openFolderDialog() { creates++; }, fillFolderSelect(select) { select.value = ''; } });
  function $(id) { return nodes[id]; }
  vm.runInContext(source.slice(source.indexOf('function startImport()'), source.indexOf("$('import-input').addEventListener")) + '\nglobalThis.start=startImport;', context);
  context.start(); assert.equal(opens, 1); assert.equal(selects, 0); assert.equal(context.importFolderId, null);
  handlers['import-form:submit']({ preventDefault() {} }); assert.equal(selects, 0);
  nodes['import-folder'].value = 'chosen'; handlers['import-form:submit']({ preventDefault() {} });
  assert.equal(selects, 1); assert.equal(context.importFolderId, 'chosen');
  view.folderId = 'first'; assert.equal(context.importFolderId, 'chosen', 'navigation while choosing files must not change the destination');
  context.start(); assert.equal(selects, 2); assert.equal(context.importFolderId, 'first');
  state.folders = []; context.start(); assert.equal(creates, 1); assert.equal(selects, 2);
});

test('popup offers cancellation only for an actual waiting native capture', async () => {
  const source = fs.readFileSync(new URL('../popup.js', import.meta.url), 'utf8');
  const nodes = { 'parent-folder': { value: '', replaceChildren() {}, append() {} }, cancel: {} };
  let state = { folders: [], assets: [{ status: 'pending' }], waitingCaptureId: null };
  const context = vm.createContext({ $: id => nodes[id], document: {querySelector:()=>({})}, message: async () => state, folderChain() {}, Option: function() {} });
  vm.runInContext(source.slice(source.indexOf('async function refresh('), source.indexOf("$('new-folder').onclick")) + '\nglobalThis.refresh=refresh;', context);
  await context.refresh(); assert.equal(nodes.cancel.hidden, true, 'An already-started download must not offer a no-op cancellation');
  state.waitingCaptureId = 'native-waiting'; await context.refresh(); assert.equal(nodes.cancel.hidden, false);
});
