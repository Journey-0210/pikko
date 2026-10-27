import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,EXTENSION,FFMPEG,CONFIG_PATH,machine,validateConfig} from './runtime.mjs';
const checks=[];
async function check(name,fn){try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',message:e.message.split('\n')[0]});}}
await check('Node.js >= 20',()=>{if(Number(process.versions.node.split('.')[0])<20)throw Error('Install Node.js 20 or later');});
await check('Local extension ID configured',()=>{if(!EXTENSION||!/^[a-p]{32}$/.test(machine.extensionId))throw Error('Run automation/setup.mjs with the actual browser extension ID');});
await check('Competitor configuration',async()=>validateConfig(JSON.parse(await fs.readFile(CONFIG_PATH,'utf8'))));
await check('FFmpeg available',()=>promisify(execFile)(FFMPEG,['-version'],{windowsHide:true,timeout:10000}));
await check('ego-browser CLI available',()=>promisify(execFile)('ego-browser',['--version'],{windowsHide:true,timeout:10000}));
await check('No collector lock',async()=>{try{await fs.access(`${ROOT}/automation/run.lock`);}catch(e){if(e.code==='ENOENT')return;throw e;}throw Error('A collector lock exists. Inspect the owning run; do not delete it blindly');});
console.log(JSON.stringify({root:ROOT,config:CONFIG_PATH,checks,browserChecks:'NOT RUN: use agent to check login, extension, AdVault connection, official Download and exact filters before the pilot'},null,2));
if(checks.some(c=>c.status==='FAIL'))process.exitCode=1;
