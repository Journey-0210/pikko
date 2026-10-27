import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {acquireLock} from '../safety.mjs';
import os from 'node:os';import {ROOT} from '../runtime.mjs';
test('B15 B18: actual .cmd propagates startup failure and never reuses last-run as a new success',{skip:process.platform!=='win32'},async()=>{
 const root=await fs.mkdtemp(os.tmpdir()+'/pikko-entry-');await fs.mkdir(root+'/automation');await fs.copyFile(ROOT+'/automation/Start-BigSpy.cmd',root+'/automation/Start-BigSpy.cmd');
 const file=root+'/automation/last-run.json',before=JSON.stringify({sentinel:'previous report'});await fs.writeFile(file,before);const release=await acquireLock(root+'/automation/run.lock');
 try{let failure;try{await promisify(execFile)('cmd.exe',['/c','automation\\Start-BigSpy.cmd','--no-pause'],{cwd:root,windowsHide:true,timeout:60000});}catch(e){failure=e;}
 assert.ok(failure);assert.notEqual(failure.code,0);assert.ok((failure.stdout+failure.stderr).includes('Another collector owns'));assert.equal(await fs.readFile(file,'utf8'),before);
 }finally{await release();}
});
