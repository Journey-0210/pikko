import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {requestFor,PROMPT} from '../welcome.mjs';import {ROOT} from '../runtime.mjs';
const run=(file,args,options,input='')=>new Promise((resolve,reject)=>{const c=execFile(file,args,{windowsHide:true,timeout:20000,...options},(error,stdout,stderr)=>resolve({code:error?.code||0,stdout,stderr}));c.on('error',reject);c.stdin.end(input);});
test('welcome validates owner requirements without turning an unverified brand into collection config',()=>{
 assert.throws(()=>requestFor('','',''),/竞品/);assert.throws(()=>requestFor('Acme','',''),/国家/);assert.throws(()=>requestFor('Acme','Malaysia','x'.repeat(4001)),/过长/);
 const r=requestFor("Acme & $(echo PWNED) % demo, Example's app",'Malaysia','https://example.com/?q=a&b=c');assert.equal(r.competitors.length,2);assert.equal(r.status,'needs_agent_verification');assert.equal(r.pilot.topCount,2);assert.ok(!('match' in r));
});
test('first-use questions save only requirements, reuse them, preserve personal config and refuse an active collector',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pikko-welcome-'));await fs.mkdir(dir+'/automation');for(const f of ['welcome.mjs','runtime.mjs'])await fs.copyFile(ROOT+'/automation/'+f,dir+'/automation/'+f);
 const config='{"personal":"keep"}',machine='{"extensionId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}';await fs.writeFile(dir+'/automation/config.json',config);await fs.writeFile(dir+'/automation/machine.json',machine);
 const result=await run(process.execPath,[dir+'/automation/welcome.mjs','--prepare-only'],{},"Acme & $(echo PWNED) % demo, Example\nMalaysia\nhttps://example.com/?a=b&c=d\n");assert.equal(result.code,0,result.stderr);
 const saved=await fs.readFile(dir+'/automation/onboarding-request.json','utf8'),request=JSON.parse(saved);assert.equal(request.competitors.length,2);assert.equal(request.market,'Malaysia');
 assert.equal(await fs.readFile(dir+'/automation/config.json','utf8'),config);assert.equal(await fs.readFile(dir+'/automation/machine.json','utf8'),machine);
 const again=await run(process.execPath,[dir+'/automation/welcome.mjs','--prepare-only'],{});assert.equal(again.code,0,again.stderr);assert.equal(await fs.readFile(dir+'/automation/onboarding-request.json','utf8'),saved);
 await fs.writeFile(dir+'/automation/run.lock','owner');const locked=await run(process.execPath,[dir+'/automation/welcome.mjs','--prepare-only'],{});assert.notEqual(locked.code,0);assert.match(locked.stderr,/任务锁/);assert.equal(await fs.readFile(dir+'/automation/run.lock','utf8'),'owner');
});
test('Windows welcome and Codex handoff preserve special paths, fixed prompt and child failure code',{skip:process.platform!=='win32'},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pikko-welcome-win-')),root=dir+"/中文 space & O'Brien % folder";await fs.mkdir(root+'/automation',{recursive:true});for(const f of ['welcome.mjs','runtime.mjs'])await fs.copyFile(ROOT+'/automation/'+f,root+'/automation/'+f);for(const f of ['Start-Here.cmd','开始使用.cmd'])await fs.copyFile(ROOT+'/'+f,root+'/'+f);
 const request=requestFor('Example','Malaysia','');await fs.writeFile(root+'/automation/onboarding-request.json',JSON.stringify(request));
 await fs.writeFile(root+'/codex.cmd','@echo off\r\n"'+process.execPath+'" "%~dp0capture.mjs" %*\r\n');await fs.writeFile(root+'/capture.mjs',"import fs from 'node:fs';fs.writeFileSync(process.env.PIKKO_TEST_CAPTURE,JSON.stringify(process.argv.slice(2)));process.exit(7);");
 const output=dir+'/args.json',result=await run('cmd.exe',['/d','/c','开始使用.cmd'],{cwd:root,env:{...process.env,PATH:root+';'+process.env.PATH,PIKKO_TEST_CAPTURE:output}});
 assert.equal(result.code,7,result.stdout+result.stderr);assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),['--cd',root.replaceAll('\\','/'),PROMPT]);assert.equal(await fs.readFile(root+'/automation/onboarding-request.json','utf8'),JSON.stringify(request));
 assert.equal(await fs.readFile(ROOT+'/Start-Here.cmd','utf8'),await fs.readFile(ROOT+'/开始使用.cmd','utf8'));
 const fallback=await run(process.execPath,[root+'/automation/welcome.mjs'],{cwd:dir,env:{...process.env,PATH:process.env.SystemRoot+'/System32'}});assert.equal(fallback.code,0,fallback.stderr);assert.match(fallback.stdout,/没有自动启动AI/);
});
