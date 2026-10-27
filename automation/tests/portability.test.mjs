import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {ROOT,validateConfig} from '../runtime.mjs';import {selectionReason,checkpointMatches} from '../safety.mjs';
const exec=promisify(execFile),base=JSON.parse(await fs.readFile(ROOT+'/automation/config.example.json','utf8'));
const config=()=>({...base,brands:[{folder:'Example',query:'Example',match:['Example']}],country:'Singapore',industry:null});
test('first-run empty template refuses collection; malformed scopes fail before browser downloads',()=>{
 assert.throws(()=>validateConfig(base),/competitor/);assert.equal(validateConfig(config()).country,'Singapore');
 for(const patch of [{country:''},{topCount:0},{brands:[{folder:'Example',query:'Example',match:[]}]},{platforms:[{name:'TikTok',folder:'TT'}]},{dateRange:{start:'2026-02-30',end:'2026-03-10'}}])assert.throws(()=>validateConfig({...config(),...patch}));
});
test('configured country is enforced and checkpoints from another country/category are rejected',()=>{
 const r={adId:'id',advertiser:'Example',network:'Facebook',region:'Singapore',firstSeen:'2026-10-01',lastSeen:'2026-10-27',runningDays:27};
 const c={r,brand:config().brands[0],platform:{name:'Facebook'},mode:'new',country:'Singapore',range:{start:'2026-09-27',end:'2026-10-27'},families:new Set(),selectedTop:new Set(),knownIds:new Set(),knownMedia:new Set()};assert.equal(selectionReason(c),'');assert.equal(selectionReason({...c,country:'Malaysia'}),'country mismatch');
 const folders=[{id:'r',name:'QA'},{id:'b',name:'Example',parentId:'r'},{id:'m',name:'2026-10',parentId:'b'},{id:'p',name:'FB',parentId:'m'}];
 const job={brand:'Example',platform:'Facebook',mode:'top',target:1,folderId:'p',status:'complete',filters:{keyword:'Example',start:'2026-09-27',end:'2026-10-27',country:'Singapore',industry:null},saved:[{assetId:'a'}]};
 const scope={brand:c.brand,platform:{name:'Facebook',folder:'FB'},mode:'top',target:1,range:c.range,country:'Singapore',industry:null,rootFolder:'QA',folders,assets:[{id:'a',folderId:'p',status:'downloaded',rating:5}]};
 assert.equal(checkpointMatches(job,scope),true);assert.equal(checkpointMatches(job,{...scope,country:'Malaysia'}),false);assert.equal(checkpointMatches(job,{...scope,industry:'Tool'}),false);
});
test('relocated setup preserves personal files and cmd launcher preserves Unicode, spaces and failure exit',{skip:process.platform!=='win32'},async()=>{
 const dir=await fs.mkdtemp(os.tmpdir()+'/pikko-team-'),root=path.join(dir,"中文 space & O'Brien % folder");await fs.mkdir(root+'/automation',{recursive:true});
 for(const file of ['runtime.mjs','setup.mjs','launch.mjs','config.example.json','Start-BigSpy.cmd'])await fs.copyFile(ROOT+'/automation/'+file,root+'/automation/'+file);
 const id='a'.repeat(32);await exec(process.execPath,[root+'/automation/setup.mjs','--extension-id',id],{windowsHide:true});
 const original=await fs.readFile(root+'/automation/machine.json','utf8');await exec(process.execPath,[root+'/automation/setup.mjs','--extension-id','b'.repeat(32)],{windowsHide:true});assert.equal(await fs.readFile(root+'/automation/machine.json','utf8'),original);
 await fs.writeFile(root+'/ego-browser.cmd','@echo off\r\nnode "%~dp0stub.mjs" %*\r\n');await fs.writeFile(root+'/stub.mjs',"import fs from 'node:fs';fs.writeFileSync(process.env.PIKKO_TEST_OUTPUT,JSON.stringify(process.argv.slice(2)));process.exit(7);");
 const output=dir+'/args.json';let failure;try{await exec('cmd.exe',['/c','automation\\Start-BigSpy.cmd','--no-pause'],{cwd:root,env:{...process.env,PIKKO_TEST_OUTPUT:output},windowsHide:true});}catch(e){failure=e;}
 assert.equal(failure?.code,7,JSON.stringify({stdout:failure?.stdout,stderr:failure?.stderr}));const args=JSON.parse(await fs.readFile(output,'utf8'));assert.deepEqual(args,['nodejs','-e',`await import('${pathToFileURL(root+'/automation/run.mjs').href.replaceAll("'",'%27')}')`]);
});
