import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../run.mjs',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('async function filters('),source.indexOf('  if(industry&&!await page.evaluate'));
test('reset scopes the network before waiting on the broad all-network query',async()=>{
 const calls=[];
 const context=vm.createContext({ensureBrowserWindow:async()=>{},loadListing:async()=>{},page:{},clickText:async text=>calls.push(text),clickNetwork:async name=>calls.push(name),settled:async()=>{throw Error('Broad reset query must not be awaited');}});
 vm.runInContext(prefix+'}\nglobalThis.run=filters;',context);
 await context.run({}, {name:'Facebook'},'top');
 await context.run({}, {name:'AdMob'},'new');
 assert.deepEqual(calls,['Reset','Facebook','Reset','AdMob']);
});
