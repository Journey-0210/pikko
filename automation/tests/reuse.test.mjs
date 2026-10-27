import test from 'node:test';import assert from 'node:assert/strict';import {saveCreative} from '../browser.mjs';
test('B04 B13 E01: fixed-input rerun reuses the same family without clicks, downloads, mutations or new records',async()=>{
 const asset={id:'saved',folderId:'gg',status:'downloaded',rating:5,kind:'video',research:{adId:'older-id'},tags:['pk:family']};
 let reads=0;const library={evaluate:async()=>{reads++;return {assets:[structuredClone(asset)],folders:[]};}},page=new Proxy({},{get(){throw Error('A repeated creative must not touch the page');}});
 const result=await saveCreative(page,library,{research:{adId:'new-copy'},familyIds:['new-copy','older-id'],familyKeys:['pk:family'],mediaKeys:[]},'gg','QA',5,[],8);
 assert.equal(result.reused,true);assert.equal(reads,1);assert.deepEqual(result.asset,asset);
});
