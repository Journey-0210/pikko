import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import crypto from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import os from 'node:os';import {ROOT} from '../runtime.mjs';
test('B01 B07: production verifier accepts decoded image/video fixtures and refuses a truncated video without writing a pass',async()=>{
 const root=ROOT,base=await fs.mkdtemp(os.tmpdir()+'/pikko-verification-');
 for(const corrupt of [false,true]){
  const dir=base+(corrupt?'-corrupt':'-valid');await fs.mkdir(dir,{recursive:true});const assets=[],saved=[],candidates=[];
  for(const [index,kind,name] of [[1,'image','image.png'],[2,'video','video.mp4']]){
   const id=String(index).padStart(32,'0'),filename=dir+'/'+name;let bytes=await fs.readFile(root+'/extension/tests/fixtures/'+name);if(corrupt&&kind==='video')bytes=bytes.subarray(0,24);await fs.writeFile(filename,bytes);await fs.writeFile(filename+'.source.txt','Fixture source '+id);
   assets.push({id,folderId:'qa',status:'downloaded',rating:0,kind,filename,research:{provider:'BigSpy',adId:id},sourcePage:'https://app.bigspy.com/adspy/creative/'+id,sourceNote:{status:'downloaded',relativePath:name+'.source.txt'}});
   saved.push({assetId:id,adId:id,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});candidates.push({id,firstSeen:'2026-09-27',lastSeen:'2026-10-27'});
  }
  await fs.writeFile(dir+'/before.json',JSON.stringify({assets:[],folders:[]}));await fs.writeFile(dir+'/after.json',JSON.stringify({assets,folders:[],settings:{localRoot:dir}}));
  await fs.writeFile(dir+'/report.json',JSON.stringify({status:'complete',executionStatus:'completed',jobs:[{brand:'Fixture',platform:'AdMob',mode:'new',status:'complete',target:2,folderId:'qa',filters:{start:'2026-09-27',end:'2026-10-27'},saved,candidates}]}));
  const run=()=>promisify(execFile)(process.execPath,[root+'/automation/verify.mjs',dir],{cwd:root,windowsHide:true,timeout:20000});
  if(corrupt){await assert.rejects(run());await assert.rejects(fs.access(dir+'/verification.json'));}
  else{await run();const v=JSON.parse(await fs.readFile(dir+'/verification.json','utf8'));assert.equal(v.checked,2);assert.equal(v.status,'passed');}
 }
});
