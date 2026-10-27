import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {loadListing,detailReady} from '../browser.mjs';
test('committed usable listing survives a transient navigation-close error; wrong/unready document and denied access do not',async()=>{
 let ready=true,waits=0,calls=0;
 const page={goto:async()=>{calls++;throw Error('net::ERR_CONNECTION_CLOSED');},evaluate:async()=>ready,waitForSelector:async()=>waits++};await loadListing(page);assert.equal(calls,1);assert.equal(waits,1);ready=false;await assert.rejects(loadListing(page),/ERR_CONNECTION_CLOSED/);assert.equal(waits,1);
 ready=true;page.goto=async()=>{throw Error('net::ERR_CERT_AUTHORITY_INVALID');};await assert.rejects(loadListing(page),/CERT/);
});
test('detail metadata readiness ignores preview/AI loaders and changing video timers but rejects a stale creative link',()=>{
 let time=0,sourceId='a'.repeat(32),timer='0s';const id='a'.repeat(32);
 const d={get innerText(){return 'ID: '+id+'\n'+timer+'\nRunning Days\n3 Days\nCreative Analysis\nLoading '+time;},querySelector:()=>({href:'https://app.bigspy.com/en/adspy/creative/'+sourceId})};
 const c=vm.createContext({Date:{now:()=>time},document:{querySelector:()=>d}});const ready=previous=>vm.runInContext(`(${detailReady.toString()})(${JSON.stringify(previous)})`,c);
 assert.equal(ready(null),false);time=1000;timer='1s';assert.equal(ready(null),true);assert.equal(ready(id),false);sourceId='b'.repeat(32);assert.equal(ready(null),false);
});
