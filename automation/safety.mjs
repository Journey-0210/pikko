import fs from 'node:fs/promises';
export const coded=(code,message)=>Object.assign(Error(message),{code});
export async function acquireLock(path){
  let file;try{file=await fs.open(path,'wx');}catch(e){if(e.code==='EEXIST')throw coded('ALREADY_RUNNING','Another collector owns the run lock; do not start a second capture.');throw e;}
  await file.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await file.close();
  return ()=>fs.unlink(path);
}
export function progressGuard({now=Date.now,maxRunMs=1800000,idleMs=600000}={}){
  const start=now();let progress=start,failures=0;
  return {
    check(){if(now()-start>=maxRunMs)throw coded('RUN_BUDGET','Run exceeded its time budget');if(now()-progress>=idleMs)throw coded('NO_PROGRESS','No effective progress for ten minutes');},
    progress(){progress=now();},
    saved(){progress=now();failures=0;},
    failed(code){if(code==='official-count-limit')throw coded('DOWNLOAD_COUNT_LIMIT','BigSpy rejected the request with COUNT EXHAUSTED; scope and reset time are unknown');if(!code&&++failures>=3)throw coded('REPEATED_DOWNLOAD_FAILURE','Three consecutive unclassified download failures; diagnose before continuing');}
  };
}
export async function recoverUI(operation,{pending,diagnose,refresh,retries=1}){
  for(let attempt=0;;attempt++)try{return await operation(attempt);}catch(e){
    await diagnose(e,attempt);
    if(attempt>=retries||(e.code&&!['EGO_NAVIGATION_TIMEOUT','EGO_ACTION_TIMEOUT'].includes(e.code))||!/timeout|timed out|did not finish loading|did not become available|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_TIMED_OUT/i.test(e.message)||await pending())throw e;
    await refresh();
  }
}
export const normalized=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function rankingDays(value,previous=Infinity){if(!Number.isInteger(value)||value>previous)throw coded('RANKING_CHANGED','Eligible source running-days order changed');return value;}
export function finishJob(job){job.status=job.saved.length===job.target?(job.limitation?'complete_with_omissions':'complete'):'partial';if(job.status==='partial'&&!job.stopReason)job.stopReason='candidate limit';return job;}
export function selectionReason({r,brand,platform,mode,range,country='Malaysia',keys=[],familyIds=[],families,selectedTop,current,knownIds,knownMedia,downloadAllowed=true,downloadReason=''}){
 if(!brand.match.some(name=>normalized(r.advertiser).includes(normalized(name))||normalized(r.adAccount).includes(normalized(name))))return 'advertiser mismatch';
 if(r.adAccount&&!(brand.reviewedAds||[]).includes(r.adId)&&![...brand.match,...brand.accountMatch||[]].some(name=>normalized(r.adAccount).includes(normalized(name))))return 'ad account needs brand review';
 if(normalized(r.network)!==normalized(platform.name))return 'platform mismatch';
 if(!r.region?.includes(country))return 'country mismatch';
 if(!r.firstSeen||!r.lastSeen||r.firstSeen>range.end||r.lastSeen<range.start)return 'outside observed date window';
 if(mode==='new'&&r.firstSeen<range.start)return 'creative first appeared before this 30-day window';
 if(mode==='top'&&!Number.isInteger(r.runningDays))return 'running days unavailable';
 if(keys.some(k=>families.has(k)))return 'same creative family';
 if(mode==='new'&&(selectedTop.has(r.adId)||current?.rating===5))return 'already in this period top five';
 if(mode==='new'&&!current&&(familyIds.some(id=>knownIds.has(id))||keys.some(k=>knownMedia.has(k))))return 'already in historical library';
 if(!current&&!downloadAllowed)return downloadReason||'Official download unavailable';
 return '';
}
export function checkpointMatches(job,{brand,platform,mode,target,range,assets,folders,rootFolder,country='Malaysia',industry='Tool'}){
 if(job.brand!==brand.folder||job.platform!==platform.name||job.mode!==mode||job.target!==target||job.filters?.keyword!==brand.query||(job.filters?.searchField||'Ad Info')!==(brand.searchField||'Ad Info'))return false;
 if((job.filters.country||'Malaysia')!==country||(job.filters.industry===undefined?'Tool':job.filters.industry)!==industry)return false;
 if(job.filters.start!==range.start||job.filters.end!==range.end||!['complete','complete_with_omissions','empty'].includes(job.status))return false;
 if(job.status==='empty'&&!/\b0 related ads\b|No results|No matching/i.test(job.filters.text||''))return false;
 if(job.status!=='empty'&&job.saved.length!==target)return false;
 const chain=[];let id=job.folderId;const seen=new Set();while(id){if(seen.has(id))return false;seen.add(id);const f=folders.find(f=>f.id===id);if(!f)return false;chain.unshift(f.name);id=f.parentId;}
 if(JSON.stringify(chain)!==JSON.stringify([rootFolder,brand.folder,range.end.slice(0,7),platform.folder]))return false;
 return job.saved.every(item=>assets.some(a=>a.id===item.assetId&&a.folderId===job.folderId&&a.status==='downloaded'&&a.rating===(mode==='top'?5:0)&&(mode==='top'||a.research?.firstSeen>=range.start)));
}
