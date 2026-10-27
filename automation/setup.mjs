import fs from 'node:fs/promises';
import {ROOT} from './runtime.mjs';
const args=process.argv.slice(2);
if(args.includes('--help')){console.log('node automation/setup.mjs --extension-id <32 lowercase a-p letters> [--ffmpeg <executable path>]\nCreates machine.json and config.json only when absent. Never overwrites existing configuration.');process.exit(0);}
const options={};for(let i=0;i<args.length;i+=2){if(!['--extension-id','--ffmpeg'].includes(args[i])||!args[i+1])throw Error('Unknown or incomplete option. Use --help');options[args[i]]=args[i+1];}
if(!/^[a-p]{32}$/.test(options['--extension-id']||''))throw Error('Provide the actual pikko extension ID from this browser, using --extension-id');
async function create(name,value){try{await fs.writeFile(`${ROOT}/automation/${name}`,value,{flag:'wx'});console.log('Created automation/'+name);}catch(e){if(e.code!=='EEXIST')throw e;console.log('Kept existing automation/'+name);}}
await create('machine.json',JSON.stringify({extensionId:options['--extension-id'],ffmpegPath:options['--ffmpeg']||'ffmpeg'},null,2)+'\n');
await create('config.json',await fs.readFile(`${ROOT}/automation/config.example.json`,'utf8'));
console.log('Next: have your agent verify the competitors and edit config.json; then run node automation/doctor.mjs. Setup does not log in or download.');
