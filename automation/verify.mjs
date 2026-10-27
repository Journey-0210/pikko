import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from './browser.mjs';
import {FFMPEG as ffmpeg} from './runtime.mjs';
const exec=promisify(execFile);
const directory=process.argv[2]||`${ROOT}/automation/runs/${(await fs.readdir(`${ROOT}/automation/runs`)).sort().at(-1)}`;
const report=JSON.parse(await fs.readFile(`${directory}/report.json`,'utf8'));
const before=JSON.parse(await fs.readFile(`${directory}/before.json`,'utf8'));
const after=JSON.parse(await fs.readFile(`${directory}/after.json`,'utf8'));
const allowIncomplete=process.argv.includes('--allow-incomplete');
if(!allowIncomplete){
  assert.ok(['complete','partial'].includes(report.status),'Run did not finish');
  assert.equal(report.executionStatus,'completed','One or more collection jobs failed');
}
for(const update of report.ratingUpdates||[]) {
  assert.ok(update.before.tags?.includes('BigSpy验证'));
  assert.equal(update.after.rating,5);
  assert.deepEqual({...update.after,rating:update.before.rating,updatedAt:update.before.updatedAt},update.before,'Rating update modified unrelated metadata');
}
for(const a of before.assets)assert.deepEqual(after.assets.find(b=>a.id===b.id),(report.ratingUpdates||[]).find(u=>u.id===a.id)?.after||a);
for(const f of before.folders)assert.deepEqual(after.folders.find(b=>f.id===b.id),f);
const files=[];
const selectedIds=new Set();
const platformHashes=new Map();
for(const job of report.jobs) {
  assert.ok(job.saved.length<=job.target);
  if(job.status==='complete')assert.equal(job.saved.length,job.target);
  assert.equal(new Set(job.saved.map(a=>a.adId)).size,job.saved.length);
  let previousDays=Infinity;
  for(const item of job.saved) {
    const asset=after.assets.find(a=>a.id===item.assetId);
    assert.ok(!selectedIds.has(asset.id),'Asset selected twice');selectedIds.add(asset.id);
    assert.equal(asset.folderId,job.folderId);assert.equal(asset.status,'downloaded');
    assert.equal(asset.rating,job.mode==='top'?5:0);assert.equal(asset.research.provider,'BigSpy');
    const candidate=job.candidates.find(c=>c.id===(item.candidateAdId||item.adId));
    assert.ok(candidate,'Saved selection has no source candidate evidence');
    assert.ok(candidate.firstSeen<=job.filters.end&&candidate.lastSeen>=job.filters.start,'Selected creative is outside the observed window');
    if(job.mode==='new')assert.ok(candidate.firstSeen>=job.filters.start,'New creative first appeared before this window');
    else {assert.ok(Number.isInteger(candidate.runningDays)&&candidate.runningDays<=previousDays,'Top selections are not in running-days order');previousDays=candidate.runningDays;}
    assert.ok(asset.sourcePage.includes(`/creative/${asset.research.adId}`),'Source URL does not match the saved ad ID');
    const bytes=await fs.readFile(asset.filename);
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const key=`${job.brand}/${job.platform}/${sha256}`;
    assert.ok(!platformHashes.has(key),'Identical file selected twice for the same brand/platform');platformHashes.set(key,asset.id);
    if(item.sha256)assert.equal(sha256,item.sha256);
    assert.ok(!/^\s*(?:<!doctype|<html)/i.test(bytes.subarray(0,200).toString()));
    await exec(ffmpeg,['-v','error','-xerror','-i',asset.filename,'-f','null','-'],{windowsHide:true,timeout:180000,maxBuffer:1024*1024});
    assert.equal(asset.sourceNote?.status,'downloaded','Source note was not saved');
    const note=await fs.readFile(path.join(after.settings.localRoot,asset.sourceNote.relativePath),'utf8');
    assert.ok(note.includes(asset.research.adId),'Source note does not identify this ad');
    for(const key of ['runningDays','firstSeen','lastSeen','impressions','score','weekScore','adAccount'])if(asset.research[key]!==undefined)assert.ok(note.includes(String(asset.research[key])),'Source note is missing saved BigSpy field: '+key);
    files.push({assetId:asset.id,adId:asset.research.adId,kind:asset.kind,bytes:bytes.length,sha256,decoded:true,source:asset.sourcePage,filename:asset.filename,sourceNoteStatus:asset.sourceNote?.status});
  }
}
const result={checkedAt:new Date().toISOString(),status:'passed',scope:allowIncomplete?'saved_files_only':'completed_collection',collectionCompleted:report.executionStatus==='completed',reportStatus:report.status,originalAssetsPreserved:before.assets.length,originalFoldersPreserved:before.folders.length,newAssets:after.assets.length-before.assets.length,checked:files.length,images:files.filter(x=>x.kind==='image').length,videos:files.filter(x=>x.kind==='video').length,files};
await fs.writeFile(`${directory}/verification.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,files:undefined}));
