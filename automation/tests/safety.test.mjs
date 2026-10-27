import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';
import {acquireLock,progressGuard,recoverUI,selectionReason,checkpointMatches,rankingDays,finishJob} from '../safety.mjs';
const brand={folder:'Tambadana',query:'Tambadana',match:['Tambadana'],accountMatch:['Wawasan']},platform={name:'AdMob',folder:'GG'};
const r={adId:'id-1',advertiser:'Tambadana',adAccount:'Wawasan',network:'AdMob',region:'Malaysia',firstSeen:'2026-09-27',lastSeen:'2026-10-27',runningDays:31};
const context=()=>({r:{...r},brand,platform,mode:'new',range:{start:'2026-09-27',end:'2026-10-27'},keys:['pk:1'],familyIds:['id-1'],families:new Set(),selectedTop:new Set(),knownIds:new Set(),knownMedia:new Set()});
test('B02 B03: inclusive dates, attribution, full running days, no missing-day fallback',()=>{
 assert.equal(selectionReason(context()),'');
 for(const [patch,expected] of [[{advertiser:'Other',adAccount:''},'advertiser mismatch'],[{network:'Facebook'},'platform mismatch'],[{region:'Singapore'},'country mismatch'],[{firstSeen:'2026-09-26'},'creative first appeared before this 30-day window'],[{firstSeen:'2026-10-28'},'outside observed date window']])assert.equal(selectionReason({...context(),r:{...r,...patch}}),expected);
 assert.equal(selectionReason({...context(),mode:'top',r:{...r,firstSeen:'2026-08-01'}}),'');assert.equal(selectionReason({...context(),mode:'top',r:{...r,runningDays:undefined}}),'running days unavailable');
});
test('B04 B05: same family, historical latest, monthly top and current-period top exclusion',()=>{
 assert.equal(selectionReason({...context(),families:new Set(['pk:1'])}),'same creative family');
 assert.equal(selectionReason({...context(),knownIds:new Set(['id-1'])}),'already in historical library');
 assert.equal(selectionReason({...context(),knownMedia:new Set(['pk:1'])}),'already in historical library');
 assert.equal(selectionReason({...context(),mode:'top',knownIds:new Set(['id-1'])}),'');
 assert.equal(selectionReason({...context(),selectedTop:new Set(['id-1'])}),'already in this period top five');
 assert.equal(selectionReason({...context(),current:{rating:0},knownIds:new Set(['id-1'])}),'');
});
test('B08 B10: explicit count limit stops immediately, three unknown failures stop, progress watchdog and budget are bounded',()=>{
 let time=0;const g=progressGuard({now:()=>time,maxRunMs:900000});assert.throws(()=>g.failed('official-count-limit'),{code:'DOWNLOAD_COUNT_LIMIT'});
 g.failed();g.failed();assert.throws(()=>g.failed(),{code:'REPEATED_DOWNLOAD_FAILURE'});g.saved();g.failed();g.failed();g.check();
 time=600000;assert.throws(()=>g.check(),{code:'NO_PROGRESS'});g.progress();g.check();time=900000;assert.throws(()=>g.check(),{code:'RUN_BUDGET'});
});
test('refresh recovery: timeout evidence retained; one refresh only, no refresh while pending or explicitly denied',async()=>{
 let count=0,refresh=0,diagnoses=0;
 const options={pending:async()=>false,diagnose:async()=>diagnoses++,refresh:async()=>refresh++};
 assert.equal(await recoverUI(async()=>{if(!count++)throw Error('page timed out');return 'ok';},options),'ok');assert.equal(refresh,1);assert.equal(diagnoses,1);
 count=0;refresh=0;assert.equal(await recoverUI(async()=>{if(!count++)throw Object.assign(Error('navigation timed out'),{code:'EGO_NAVIGATION_TIMEOUT'});return 'ready';},options),'ready');assert.equal(refresh,1);
 refresh=0;await assert.rejects(recoverUI(async()=>{throw Error('timeout');},{...options,pending:async()=>true}));assert.equal(refresh,0);
 await assert.rejects(recoverUI(async()=>{throw Object.assign(Error('timeout'),{code:'DOWNLOAD_COUNT_LIMIT'});},options));assert.equal(refresh,0);
 await assert.rejects(recoverUI(async()=>{throw Error('timeout');},options));assert.equal(refresh,1);
});
test('B14: reject partial, stale dates, changed target, changed folder, wrong field checkpoint',()=>{
 const folders=[{id:'root',name:'QA'},{id:'brand',name:'Tambadana',parentId:'root'},{id:'month',name:'2026-10',parentId:'brand'},{id:'gg',name:'GG',parentId:'month'}];
 const job={brand:'Tambadana',platform:'AdMob',mode:'top',target:1,folderId:'gg',status:'complete',filters:{keyword:'Tambadana',searchField:'Ad Info',start:'2026-09-27',end:'2026-10-27'},saved:[{assetId:'a'}]};
 const c={brand,platform,mode:'top',target:1,range:{start:'2026-09-27',end:'2026-10-27'},assets:[{id:'a',status:'downloaded',rating:5,folderId:'gg'}],folders,rootFolder:'QA'};
 assert.equal(checkpointMatches(job,c),true);
 for(const patch of [{status:'partial'},{target:2},{folderId:'missing'},{filters:{...job.filters,end:'2026-10-26'}},{filters:{...job.filters,searchField:'Advertiser'}}])assert.equal(checkpointMatches({...job,...patch},c),false);
 assert.equal(checkpointMatches(job,{...c,rootFolder:'Other'}),false);
});
test('B15 B18: second startup is rejected atomically and cannot remove the first lock',async()=>{
 const dir=await fs.mkdtemp(os.tmpdir()+'/pikko-lock-'),path=dir+'/run.lock';
 const release=await acquireLock(path);try{await assert.rejects(acquireLock(path),{code:'ALREADY_RUNNING'});assert.ok(await fs.stat(path));}finally{await release();await fs.rmdir(dir);}
});
test('B03 B17: actual running-day ordering and source/candidate shortages retain counts and truthful limits',()=>{
 let previous=Infinity;for(const days of [400,120,31,31,1])previous=rankingDays(days,previous);assert.throws(()=>rankingDays(2,previous));assert.throws(()=>rankingDays(undefined));
 const job={target:3,saved:[{id:'one'}],candidates:Array(35).fill({}),skipped:Array(34).fill({reason:'already in historical library'})};finishJob(job);assert.equal(job.status,'partial');assert.equal(job.stopReason,'candidate limit');assert.equal(job.saved.length,1);assert.equal(job.candidates.length,35);
 const source={target:3,saved:[],stopReason:'end of currently navigable results'};finishJob(source);assert.equal(source.stopReason,'end of currently navigable results');assert.equal(source.status,'partial');
});
