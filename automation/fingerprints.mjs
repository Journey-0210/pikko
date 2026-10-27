import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from './browser.mjs';
import {FFMPEG as ffmpeg} from './runtime.mjs';
const exec=promisify(execFile);
const cachePath=`${ROOT}/automation/media-fingerprints.json`;
let cache;
export async function fingerprint(asset) {
  if(!cache)try{cache=JSON.parse(await fs.readFile(cachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;cache={};}
  const stat=await fs.stat(asset.filename),key=`${asset.filename}:${stat.size}:${stat.mtimeMs}`;
  if(cache[key])return cache[key];
  const probe=await exec(ffmpeg,['-hide_banner','-i',asset.filename,'-t','0','-f','null','-'],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  const dim=probe.stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if(!dim)throw Error('Media dimensions unavailable: '+asset.filename);
  const duration=probe.stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const seconds=asset.kind==='video'&&duration?Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]):0;
  if(asset.kind==='video'&&!seconds)throw Error('Video duration unavailable: '+asset.filename);
  const frames=[];
  for(const fraction of seconds?[.1,.5,.85]:[0]) {
    const {stdout}=await exec(ffmpeg,['-v','error',...(seconds?['-ss',String(seconds*fraction)]:[]),'-i',asset.filename,'-frames:v','1','-vf','scale=32:32','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,timeout:60000,maxBuffer:1024*1024,encoding:'buffer'});
    if(stdout.length!==3072)throw Error('Could not read normalized frame');
    frames.push(stdout.toString('base64'));
  }
  const result={kind:asset.kind,aspect:Number(dim[1])/Number(dim[2]),seconds,frames};
  cache[key]=result;
  await fs.writeFile(cachePath,JSON.stringify(cache));
  return result;
}
// Conservative: close aspect/duration AND every sampled RGB frame must nearly match.
// This catches resized/re-encoded copies, not different edits of the same story.
export function sameVisual(a,b) {
  if(a.kind!==b.kind||Math.abs(a.aspect-b.aspect)/a.aspect>.015||Math.abs(a.seconds-b.seconds)>.3||a.frames.length!==b.frames.length)return false;
  return a.frames.every((frame,i)=>{
    const x=Buffer.from(frame,'base64'),y=Buffer.from(b.frames[i],'base64');
    let difference=0;
    for(let n=0;n<x.length;n++)difference+=Math.abs(x[n]-y[n]);
    return difference/x.length<=2;
  });
}
