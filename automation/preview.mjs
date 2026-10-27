import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from './browser.mjs';
import {FFMPEG as ffmpeg} from './runtime.mjs';
const directory=process.argv[2]||JSON.parse(await fs.readFile(`${ROOT}/automation/last-run.json`,'utf8')).directory;
const report=JSON.parse(await fs.readFile(`${directory}/report.json`,'utf8'));
const out=`${directory}/previews`;
await fs.mkdir(out,{recursive:true});
const exec=promisify(execFile);
const run=args=>exec(ffmpeg,args,{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
const entries=[];
for(const job of report.jobs)for(const asset of job.saved) {
  const file=`${out}/${asset.assetId}.png`;
  try {await fs.access(file);}catch {
    let seek=[];
    if(asset.kind==='video') {
      const probe=await run(['-hide_banner','-i',asset.filename,'-t','0','-f','null','-']);
      const m=probe.stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if(!m)throw Error('No video duration: '+asset.adId);
      seek=['-ss',String((Number(m[1])*3600+Number(m[2])*60+Number(m[3]))*.5)];
    }
    await run(['-v','error',...seek,'-i',asset.filename,'-frames:v','1','-vf','scale=300:210:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2:white','-y',file]);
  }
  entries.push({brand:job.brand,platform:job.platform,mode:job.mode,assetId:asset.assetId,adId:asset.adId,kind:asset.kind,file});
}
const sheets=[];
for(let start=0;start<entries.length;start+=12) {
  const batch=entries.slice(start,start+12),file=`${out}/sheet-${start+1}-${start+batch.length}.png`;
  if(batch.length===1)await fs.copyFile(batch[0].file,file);
  else await run(['-v','error',...batch.flatMap(a=>['-i',a.file]),'-filter_complex',`xstack=inputs=${batch.length}:layout=${batch.map((_,i)=>`${i%4*320}_${Math.floor(i/4)*240}`).join('|')}`,'-frames:v','1','-y',file]);
  sheets.push({file,entries:batch});
}
await fs.writeFile(`${out}/index.json`,JSON.stringify(sheets,null,2));
console.log(JSON.stringify({assets:entries.length,sheets:sheets.map(s=>({file:s.file,labels:s.entries.map(a=>`${a.brand}/${a.platform}/${a.mode}/${a.kind}/${a.adId.slice(0,6)}`)}))}));
