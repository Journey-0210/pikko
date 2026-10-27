import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ROOT} from './runtime.mjs';
// The URI has no shell metacharacters or literal double quotes, even in a relocated folder.
const url=pathToFileURL(`${ROOT}/automation/run.mjs`).href.replaceAll("'",'%27');
const expression=`await import('${url}')`;
const windows=process.platform==='win32';
const child=windows?spawn('cmd.exe',['/d','/s','/c','ego-browser nodejs -e "%PIKKO_ENTRY%"'],{cwd:ROOT,env:{...process.env,PIKKO_ENTRY:expression},stdio:'inherit',windowsHide:true,windowsVerbatimArguments:true}):spawn('ego-browser',['nodejs','-e',expression],{cwd:ROOT,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??1;if(signal)console.error('Collector ended with signal '+signal);});
