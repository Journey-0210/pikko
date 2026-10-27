import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from '../automation/runtime.mjs';
const buildId='pikko-team-'+new Date().toISOString().replace(/[:.]/g,'-');
const target=`${ROOT}/dist/${buildId}/pikko-team`;await fs.mkdir(target,{recursive:true});
const entries=[];
async function copy(file,to=file){const data=await fs.readFile(ROOT+'/'+file);await fs.mkdir(path.dirname(target+'/'+to),{recursive:true});await fs.writeFile(target+'/'+to,data);entries.push({path:to,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}
for(const file of ['.gitignore','README.md','AGENTS.md','AGENT_START.txt','DELIVERY_VERIFICATION.md','docs/TEAM_GUIDE.md','docs/AGENT_PROMPTS.md','docs/AGENT_PLAYBOOK.md','docs/RELEASE_NOTES.md','docs/EXTENSION_README.md'])await copy(file);
await copy('README.md','START_HERE.md');
await copy('docs/EXTENSION_README.md','extension/README.md');
for(const file of (await fs.readdir(ROOT+'/extension')).filter(f=>/\.(js|css|html)$/.test(f)||['manifest.json','package.json'].includes(f)))await copy('extension/'+file);
async function tree(dir){for(const entry of await fs.readdir(ROOT+'/'+dir,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Symlinks are not allowed in release: '+entry.name);const file=dir+'/'+entry.name;if(entry.isDirectory())await tree(file);else await copy(file);}}
await tree('extension/assets');await tree('extension/tests');await tree('automation/tests');
for(const file of ['browser.mjs','runtime.mjs','run.mjs','safety.mjs','families.mjs','fingerprints.mjs','preview.mjs','verify.mjs','setup.mjs','doctor.mjs','launch.mjs','Start-BigSpy.cmd','Stop-BigSpy.cmd','config.example.json'])await copy('automation/'+file);
await copy('release/build.mjs');
// Installation starts with no competitors or machine ID. Personal files are never copied.
await copy('automation/config.example.json','automation/config.json');
const manifest={buildId,createdAt:new Date().toISOString(),extensionVersion:JSON.parse(await fs.readFile(ROOT+'/extension/manifest.json','utf8')).version,distribution:'Internal team preview; Windows pilot required per user',excluded:['machine.json','personal config','session','run lock','historical creative families','fingerprint cache','runs','qa','backups','media','browser profile'],files:entries.sort((a,b)=>a.path.localeCompare(b.path))};
await fs.writeFile(target+'/RELEASE_MANIFEST.json',JSON.stringify(manifest,null,2));
const zip=`${ROOT}/dist/${buildId}.zip`;
if(process.platform==='win32')await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath $env:PIKKO_STAGE -DestinationPath $env:PIKKO_ZIP -CompressionLevel Optimal'],{env:{...process.env,PIKKO_STAGE:target,PIKKO_ZIP:zip},windowsHide:true,timeout:120000});
else await promisify(execFile)('zip',['-qr',zip,'pikko-team'],{cwd:path.dirname(target),timeout:120000});
const result={buildId,directory:target,zip,files:entries.length,sha256:crypto.createHash('sha256').update(await fs.readFile(zip)).digest('hex')};
await fs.writeFile(ROOT+'/dist/latest.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
