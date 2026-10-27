import fs from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {ROOT} from './runtime.mjs';

export const PROMPT='Follow AGENTS.md and docs/AGENT_PLAYBOOK.md. Read automation/onboarding-request.json as owner-provided research requirements. Guide this owner through pikko installation, environment checks, identity verification and one-brand pilot. Ask only missing questions in plain Chinese. Do not require copying AGENT_START.txt. Preserve existing configuration and media. Do not expand to a full batch.';
export function requestFor(names,market,references){
 const competitors=[...new Set(names.split(/[,，;；\n]/).map(s=>s.trim()).filter(Boolean))];
 if(!competitors.length||competitors.length>20||competitors.some(s=>s.length>150))throw Error('请输入1至20个竞品名称，每个名称不超过150字。');
 if(!market.trim()||market.length>100)throw Error('请填写调查国家或市场，不超过100字。');
 if(references.length>4000)throw Error('链接信息过长，请只填写官网或应用商店链接。');
 return {version:1,competitors,market:market.trim(),references:references.trim(),platforms:['Facebook','AdMob'],pilot:{topCount:2,newCount:3,maxCandidates:35},status:'needs_agent_verification'};
}
export async function startAgent(root){
 const windows=process.platform==='win32';
 try{await promisify(execFile)(windows?'where.exe':'which',['codex'],{windowsHide:true,timeout:5000});}catch{
  console.log('\n需求已保存。请在你常用的AI agent中打开这个文件夹，只需说“开始”。\n无需复制说明文件；agent会按项目内的引导继续。\n当前电脑未找到Codex命令行，因此没有自动启动AI。');return 0;
 }
 console.log('\n正在启动Codex继续配置；这会使用你自己的AI账号。登录和权限提示请按界面处理。');
 return await new Promise((resolve,reject)=>{
  const child=windows?spawn('cmd.exe',['/d','/s','/c','codex --cd "%PIKKO_WELCOME_ROOT%" "%PIKKO_WELCOME_PROMPT%"'],{cwd:root,env:{...process.env,PIKKO_WELCOME_ROOT:root,PIKKO_WELCOME_PROMPT:PROMPT},stdio:'inherit',windowsHide:false,windowsVerbatimArguments:true}):spawn('codex',['--cd',root,PROMPT],{cwd:root,stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>resolve(code??1));
 });
}
export async function welcome(root=ROOT,{prepareOnly=false}={}){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('需要Node.js 20或以上，请安装后重新双击“开始使用”。');
 try{await fs.access(root+'/automation/run.lock');throw Error('已有采集任务锁。请让agent检查当前任务，暂不启动第二个配置过程。');}catch(e){if(e.code!=='ENOENT')throw e;}
 const file=root+'/automation/onboarding-request.json';let request;
 try{request=JSON.parse(await fs.readFile(file,'utf8'));requestFor(request.competitors.join(','),request.market,request.references||'');}catch(e){if(e.code!=='ENOENT')throw e;}
 console.log('\npikko 首次使用\nAI会帮你配置工具；你只需要告诉它想调查什么。\n');
 if(!request){
  const rl=createInterface({input:process.stdin,output:process.stdout}),answers=rl[Symbol.asyncIterator]();
  const ask=async(label,required=false)=>{for(;;){process.stdout.write(label);const next=await answers.next();if(next.done)throw Error('输入已取消，未修改采集配置。');const value=next.value.trim();if(value||!required)return value;console.log('这一项需要填写。');}};
  try{
   const names=await ask('1. 想调查哪些竞品？多个名称用逗号隔开：',true);
   const market=await ask('2. 调查哪个国家/市场？例如 Malaysia：',true);
   const references=await ask('3. 有官网吗？或App商店链接（不知道可直接按回车）：');
   request=requestFor(names,market,references);
   await fs.mkdir(root+'/automation',{recursive:true});await fs.writeFile(file,JSON.stringify({...request,createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
  }finally{rl.close();}
 }else console.log('已找到上次填写的需求，将从这里继续。');
 console.log(`\n竞品：${request.competitors.join('、')}\n市场：${request.market}\n首次只跑小批次；已有素材、机器配置和竞品配置均保留。`);
 if(prepareOnly){console.log('需求已准备，未启动AI或下载。');return 0;}
 return await startAgent(root);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.exitCode=await welcome(ROOT,{prepareOnly:process.argv.includes('--prepare-only')});}catch(e){console.error(e.message);process.exitCode=1;}
}
