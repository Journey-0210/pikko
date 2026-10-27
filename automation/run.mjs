import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {ROOT,EXTENSION,SEARCH,ensureFolder,bindTab,readDetail,saveCreative,state,digest,message,listingReady,loadListing,detailReady} from './browser.mjs';
import {mergeFamily} from './families.mjs';
import {acquireLock,progressGuard,recoverUI,selectionReason,checkpointMatches,normalized,rankingDays,finishJob} from './safety.mjs';
import {CONFIG_PATH,FFMPEG,validateConfig} from './runtime.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const release=await acquireLock(`${ROOT}/automation/run.lock`);
try{await collect();}finally{await release();}
async function collect(){

const config=validateConfig(JSON.parse(await fs.readFile(globalThis.PIKKO_CONFIG_PATH||CONFIG_PATH,'utf8')));
assert.ok(EXTENSION,'First run: configure the actual extension ID with node automation/setup.mjs --extension-id <ID>');
await promisify(execFile)(FFMPEG,['-version'],{windowsHide:true,timeout:10000});
const country=config.country||'Malaysia',industry=config.industry===undefined?'Tool':config.industry;
const guard=progressGuard({maxRunMs:config.maxRunMs||1800000});
if(config.dateRange){
  for(const value of [config.dateRange.start,config.dateRange.end])assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value).toISOString().slice(0,10)===value,'Invalid dateRange');
  assert.ok(config.dateRange.start<=config.dateRange.end,'Date range must be chronological');
}
const stopFile=`${ROOT}/automation/stop-requested`;
await fs.unlink(stopFile).catch(error=>{if(error.code!=='ENOENT')throw error;});
async function checkStop() {
  guard.check();
  try {await fs.access(stopFile);}catch(error){if(error.code==='ENOENT')return;throw error;}
  const error=new Error('Stopped at a safe checkpoint; downloaded files are preserved');error.code='COLLECTION_STOP';throw error;
}
const resume=config.resumeReport?JSON.parse(await fs.readFile(config.resumeReport,'utf8')):null;
if(resume)assert.equal(resume.rootFolder,config.rootFolder,'Checkpoint belongs to a different output folder');
const familyPath=`${ROOT}/automation/creative-families.json`;
let familyIndex=[];
try{familyIndex=JSON.parse(await fs.readFile(familyPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const startedAt=new Date().toISOString();
const runId=startedAt.replace(/[:.]/g,'-');
const out=`${ROOT}/automation/runs/${runId}`;
await fs.mkdir(out,{recursive:true});
await fs.writeFile(`${out}/events.jsonl`,'');
const sessionPath=`${ROOT}/automation/session.json`;
let session=null;
if(!config.spaceName)try{session=JSON.parse(await fs.readFile(sessionPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const task=await taskSpace(config.spaceName||session?.name||`pikko collection ${runId}`);
if(!config.spaceName)await fs.writeFile(sessionPath,JSON.stringify({name:task.name,spaceId:task.spaceId},null,2));
const tabs=await task.tabs();
const libraryTab=tabs.find(t=>t.label&&t.url.startsWith(EXTENSION));
const sourceTab=tabs.find(t=>t.label&&(t.url.startsWith('https://app.bigspy.com/')||t.url==='about:blank'||(t.url.startsWith('chrome-error://')&&t.title==='app.bigspy.com')));
const page=sourceTab?task.page(sourceTab.label):await task.newPage();
const library=libraryTab?task.page(libraryTab.label):await task.newPage();
await library.goto(EXTENSION);
await library.waitForFunction(()=>typeof chrome?.runtime?.sendMessage==='function',undefined,{timeout:15000});
const baseline=await state(library);
await fs.writeFile(`${out}/before.json`,JSON.stringify(baseline,null,2));
const report={runId,startedAt,spaceId:task.spaceId,rootFolder:config.rootFolder,modelCalls:0,jobs:[],ratingUpdates:[],status:'running'};
report.tokenAccounting={scriptModelTokens:0,basis:'This program calls browser controls and local file tools only; it has no model API client. This is not a measurement of the surrounding Codex chat.',chatDevelopmentTokens:null};
let traceSequence=0;
const writeReport=async()=>{
  const events=(await message(library,{type:'capture.trace'})).events.filter(e=>e.sequence>traceSequence&&e.at>=startedAt);
  if(events.length){await fs.appendFile(`${out}/events.jsonl`,events.map(e=>JSON.stringify(e)).join('\n')+'\n');traceSequence=events.at(-1).sequence;}
  await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  await fs.writeFile(`${ROOT}/automation/last-run.json`,JSON.stringify({directory:out,status:report.status},null,2));
  const lines=[`BigSpy 采集结果：${report.status}`,`输出文件夹：${report.rootFolder}`,`运行记录：${out}`,''];
  for(const job of report.jobs) {
    lines.push(`${job.brand} / ${job.platform} / ${job.mode==='top'?'长投放，5星':'最新创意'}：${job.saved.length}/${job.target}，${job.status}`);
    if(job.filters)lines.push(`来源日期：${job.filters.start} 至 ${job.filters.end}`);
    if(job.limitation)lines.push(job.limitation.includes('brand verification')?'注意：有候选尚未确认品牌归属，已跳过并记录；收集结果不代表无缺失的完整排名。':'注意：存在无法预览或无法官方下载的候选，已记录缺口；这里是成功保存的素材，不代表无缺失的完整排名。');
    if(job.stopReason)lines.push(`停止原因：${job.stopReason}`);
    if(job.error)lines.push(`错误：${job.error}`);
    for(const skip of job.skipped.filter(x=>x.source))lines.push(`未收集：${skip.id}\n${skip.source}\n${skip.reason}`);
  }
  if(report.error)lines.push('',`错误：${report.error.split('\n')[0]}`);
  await fs.writeFile(`${ROOT}/automation/last-result.txt`,lines.join('\r\n'));
};
await writeReport();
console.log(JSON.stringify({event:'started',runId,spaceId:task.spaceId,baselineAssets:baseline.assets.length}));
const knownIds=new Set(baseline.assets.filter(a=>a.status==='downloaded').map(a=>a.research?.adId||a.sourcePage?.match(/\/creative\/([a-f0-9]{32})/i)?.[1]).filter(Boolean));
const knownMedia=new Set(baseline.assets.filter(a=>a.status==='downloaded').flatMap(a=>(a.tags||[]).filter(t=>t.startsWith('pk:'))));
async function ensureBrowserWindow() {
  const tab=(await task.tabs()).find(t=>t.label===page.label);
  if(!tab?.targetId)throw Error('Collection browser tab is unavailable');
  const window=await task.cdp('Browser.getWindowForTarget',{targetId:tab.targetId});
  if(window.bounds.windowState==='minimized')await task.cdp('Browser.setWindowBounds',{windowId:window.windowId,bounds:{windowState:'normal'}});
}
// BigSpy opens category popovers on pointer travel; use enabled DOM controls for deterministic filters.
async function clickText(text,scope='body') {
  await page.evaluate(({text,scope})=>{
    const matches=[...document.querySelector(scope).querySelectorAll('button,span,label,div')].filter(x=>x.innerText?.trim()===text&&x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden'&&![...x.children].some(c=>c.innerText?.trim()===text));
    if(matches.length!==1)throw Error('Ambiguous filter control: '+text+' ('+matches.length+')');
    for(let p=matches[0];p&&p!==document.body;p=p.parentElement)if(p.disabled||p.getAttribute('aria-disabled')==='true')throw Error('Disabled filter control: '+text);
    matches[0].click();
  },{text,scope});
}
async function clickNetwork(name) {
  await page.evaluate(name=>{
    const button=[...document.querySelectorAll('button[role="checkbox"]')].find(x=>x.innerText.trim()===name);
    if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')throw Error('Network is unavailable: '+name);
    button.click();
  },name);
  await settled();
}

async function settled() {await page.waitForFunction(listingReady,undefined,{timeout:45000});}
async function filters(brand,platform,mode,reloaded=false) {
  await ensureBrowserWindow();
  if(!reloaded)await loadListing(page);
  else await page.waitForSelector(SEARCH,{timeout:25000});
  await clickText('Reset','form');
  // Reset broadens to all networks; scope the query before waiting for results.
  await clickNetwork(platform.name);
  if(industry&&!await page.evaluate(industry=>document.querySelector('form')?.innerText.includes('Industry: '+industry),industry)) {
    await clickText(industry,'form');
    await settled();
  }
  const searchField=brand.searchField||'Ad Info';
  assert.ok(['Ad Info','Advertiser'].includes(searchField),'Unsupported search field');
  const currentField=await page.evaluate(()=>document.querySelector('[data-testid="keyword-search-input"]').placeholder.startsWith('Search Advertiser')?'Advertiser':'Ad Info');
  if(currentField!==searchField){await page.click(`text="${currentField}"`);await page.click(`text="${searchField}"`);}
  await page.fill(SEARCH,brand.query);
  await page.evaluate(()=>{
    const label=[...document.querySelectorAll('label')].find(x=>x.innerText.trim()==='Exact Search');
    const input=label?.querySelector('input[type="checkbox"]');
    if(!input||input.disabled)throw Error('Exact search control unavailable');
    if(!input.checked)input.click();
  });
  await page.press(SEARCH,'Enter');
  await settled();
  await page.mouse.move(20,20);
  await page.evaluate(()=>{const input=document.querySelector('input[placeholder="Start date"]');if(!input||input.disabled)throw Error('Date control unavailable');input.click();});
  if(config.dateRange){
    await page.fill('input[placeholder="Start date"]',config.dateRange.start);
    await page.press('input[placeholder="Start date"]','Enter');
    await page.fill('input[placeholder="End date"]',config.dateRange.end);
    await page.press('input[placeholder="End date"]','Enter');
    await page.waitForFunction(range=>document.querySelector('form').innerText.includes(`Time: ${range.start} - ${range.end}`),config.dateRange,{timeout:15000});
  }else await clickText('Last 30 Days');
  await settled();
  const activeNetworks=await page.evaluate(()=>[...document.querySelectorAll('[role="checkbox"][aria-checked="true"]')].map(x=>x.innerText));
  for(const name of activeNetworks.filter(name=>name!==platform.name&&name!=='All')) {
    await clickNetwork(name);
  }
  if(!activeNetworks.includes(platform.name)) {
    await clickNetwork(platform.name);
  }
  await page.click('text="Country/Region"',{timeout:10000});
  await page.fill('input[placeholder="Quickly Search for Countries and Regions"]',country);
  await page.waitForFunction(country=>[...document.querySelectorAll('[role="tooltip"] label')].some(x=>x.innerText.trim()===country),country,{timeout:10000});
  await page.evaluate(country=>{
    const labels=[...document.querySelectorAll('[role="tooltip"] label')].filter(x=>x.innerText.trim()===country);
    if(labels.length!==1)throw Error('Country selector changed');
    const input=labels[0].querySelector('input');if(!input||input.disabled)throw Error('Country unavailable');if(!input.checked)input.click();
  },country);
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='OK'&&!x.disabled&&x.getClientRects().length);if(!b)throw Error('Country confirmation unavailable');b.click();});
  await settled();
  const sort=mode==='top'?'Sort by running days ↓':'Sort by latest creatives ↓';
  if(!await page.evaluate(()=>document.querySelector('input[name="duplicate_removal"][value="1"]')?.checked)) {
    await page.evaluate(()=>{const input=document.querySelector('input[name="duplicate_removal"][value="1"]');if(!input||input.disabled)throw Error('Creative dedup control unavailable');if(!input.checked)input.click();});
    await page.waitForFunction(()=>document.querySelector('input[name="duplicate_removal"][value="1"]')?.checked,undefined,{timeout:10000});
    await settled();
  }
  // BigSpy may reset sorting when the deduplication mode changes.
  await page.click('#sort_field',{timeout:10000});
  await clickText(sort,'.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await page.waitForFunction(sort=>document.querySelector('form')?.innerText.includes(sort),sort,{timeout:10000});
  await settled();
  const evidence=await page.evaluate(()=>({
    start:document.querySelector('input[placeholder="Start date"]').value,
    end:document.querySelector('input[placeholder="End date"]').value,
    keyword:document.querySelector('[data-testid="keyword-search-input"]').value,
    searchField:document.querySelector('[data-testid="keyword-search-input"]').placeholder.startsWith('Search Advertiser')?'Advertiser':'Ad Info',
    selected:[...document.querySelectorAll('[role="checkbox"][aria-checked="true"]')].map(x=>x.innerText),
    creativeDedup:document.querySelector('input[name="duplicate_removal"][value="1"]')?.checked,
    exactSearch:[...document.querySelectorAll('label')].find(x=>x.innerText.trim()==='Exact Search')?.querySelector('input')?.checked,
    text:document.querySelector('form').innerText.split('Advertisers')[0],
    count:document.querySelectorAll('article').length
  }));
  assert.equal(evidence.keyword,brand.query);
  assert.equal(evidence.searchField,searchField);
  assert.ok(evidence.text.includes(brand.query),'Search keyword was not applied');
  assert.deepEqual(evidence.selected,[platform.name]);
  assert.ok(evidence.text.includes('Country/Region: '+country));
  if(industry)assert.ok(evidence.text.includes('Industry: '+industry),'Industry was not applied');
  evidence.country=country;evidence.industry=industry;
  assert.ok(evidence.text.includes(sort));
  assert.ok(evidence.creativeDedup);
  assert.ok(evidence.exactSearch);
  if(config.dateRange){assert.equal(evidence.start,config.dateRange.start);assert.equal(evidence.end,config.dateRange.end);}
  return {...evidence,tabId:await bindTab(page,library)};
}
async function waitDetail(previousId=null) {
  await page.waitForFunction(detailReady,previousId,{timeout:45000});
  const variants=await page.evaluate(()=>{
    const d=document.querySelector('[role="dialog"]');
    const count=Number(d.innerText.match(/There are (\d+) versions of this ad/)?.[1]||0);
    const column=[...d.querySelectorAll('div')].find(x=>/(auto|scroll)/.test(getComputedStyle(x).overflowY)&&x.innerText.startsWith('Creative\n'));
    if(count&&column)column.scrollTop=column.scrollHeight;
    return count;
  });
  if(variants) {
    await page.waitForFunction(count=>{
      const d=document.querySelector('[role="dialog"]');
      const column=[...d.querySelectorAll('div')].find(x=>/(auto|scroll)/.test(getComputedStyle(x).overflowY)&&x.innerText.startsWith('Creative\n'));
      return column&&[...column.querySelectorAll('img')].filter(x=>x.src&&x.complete&&x.naturalWidth>0).length>=count;
    },variants,{timeout:10000}).catch(error=>{if(!error.message.includes('timed out'))throw error;console.warn('Supplementary creative versions did not all load; deduplication uses the versions actually available.');});
    await page.evaluate(()=>{const d=document.querySelector('[role="dialog"]');for(const x of d.querySelectorAll('div'))if(/(auto|scroll)/.test(getComputedStyle(x).overflowY)&&x.innerText.startsWith('Creative\n'))x.scrollTop=0;});
  }
}
async function nextDetail(id) {
  const enabled=await page.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const b=[...d?.querySelectorAll('button')||[]].find(x=>x.innerText.trim()==='Next');return b&&!b.disabled;});
  if(!enabled)return false;
  await page.click('loc=role:button[name="Next"]',{timeout:10000});
  await waitDetail(id);
  return true;
}
let awaitedEnd;
try {
  if(resume) {
    await ensureBrowserWindow();
    await page.goto('https://app.bigspy.com/en/adspy/ad-library',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForSelector(SEARCH,{timeout:25000});
    await clickText('Reset','form');await settled();
    const sourceToday=await page.evaluate(()=>document.querySelector('input[placeholder="End date"]').value);
    awaitedEnd=sourceToday;
    resume.jobs=resume.jobs.filter(j=>config.dateRange?j.filters?.start===config.dateRange.start&&j.filters?.end===config.dateRange.end:j.filters?.end===sourceToday);
  }
  for(const brand of config.brands)for(const platform of config.platforms)for(const mode of brand.modes||['top','new']) {
    await checkStop();
    const checkpointState=resume?await state(library):baseline;
    if(resume)resume.jobs=resume.jobs.filter(j=>j.brand!==brand.folder||(j.filters?.searchField||'Ad Info')===(brand.searchField||'Ad Info'));
    const previous=resume?.jobs.find(j=>checkpointMatches(j,{brand,platform,mode,country,industry,target:mode==='top'?(brand.topCount??config.topCount):(brand.newCount??config.newCount),range:config.dateRange||{start:j.filters?.start,end:awaitedEnd},assets:checkpointState.assets,folders:checkpointState.folders,rootFolder:config.rootFolder}));
    if(previous){report.jobs.push({...previous,resumedFrom:config.resumeReport});await writeReport();continue;}
    const job={brand:brand.folder,platform:platform.name,mode,target:mode==='top'?(brand.topCount??config.topCount):(brand.newCount??config.newCount),candidates:[],saved:[],skipped:[],status:'running'};
    report.jobs.push(job);await writeReport();
    await recoverUI(async attempt=>{
    if(attempt){job.candidates=[];job.saved=[];job.skipped=[];job.status='running';delete job.limitation;delete job.stopReason;delete job.error;delete job.errorStack;}
    try {
    console.log(JSON.stringify({event:'job',brand:brand.folder,platform:platform.name,mode}));
    job.filters=await filters(brand,platform,mode,attempt>0);guard.progress();
    const month=job.filters.end.slice(0,7);
    job.folderId=await ensureFolder(library,[config.rootFolder,brand.folder,month,platform.folder]);
    if(!job.filters.count){job.status='empty';await writeReport();return;}
    await page.evaluate(()=>{
      const article=document.querySelector('article');
      const buttons=[...article.querySelectorAll('button[aria-label="Creative Details"]')];
      const button=buttons.find(x=>!x.disabled);if(!button)throw Error('No enabled creative details control');
      for(let p=button;p&&p!==article.parentElement;p=p.parentElement)if(p.getAttribute('aria-disabled')==='true'||getComputedStyle(p).pointerEvents==='none')throw Error('Creative details access unavailable');
      button.click();
    });
    await waitDetail();
    const visited=new Set(),families=new Set(),selectedTop=new Set(report.jobs.filter(j=>j.brand===brand.folder&&j.platform===platform.name&&j.mode==='top').flatMap(j=>j.saved.map(x=>x.adId)));
    let previousDays=Infinity;
    for(let index=0;index<config.maxCandidates;index++) {
      await checkStop();
      const detail=await readDetail(library,job.filters.tabId);
      if(detail.unsupported) {
        job.skipped.push({id:detail.adId,reason:detail.reason,source:detail.source});
        job.limitation='Some source creatives have unavailable previews or metadata; saved ranking excludes these items.';
        await writeReport();
        if(!await nextDetail(detail.adId))break;
        continue;
      }
      const r=detail.research;
      if(visited.has(r.adId)){job.stopReason='repeated navigation';break;}visited.add(r.adId);
      const sourceMediaKeys=detail.mediaKeys.map(u=>'pk:'+digest(u).slice(0,24));
      const family=mergeFamily(familyIndex,['id:'+r.adId,...sourceMediaKeys]);
      await fs.writeFile(familyPath,JSON.stringify(familyIndex,null,2));
      const keys=family.filter(k=>k.startsWith('pk:')),familyIds=family.filter(k=>k.startsWith('id:')).map(k=>k.slice(3));
      detail.familyKeys=keys;detail.familyIds=familyIds;
      job.candidates.push({id:r.adId,advertiser:r.advertiser,developer:r.developer,adAccount:r.adAccount,headline:r.headline,adText:r.adText,kind:detail.kind,firstSeen:r.firstSeen,lastSeen:r.lastSeen,runningDays:r.runningDays,sourceMediaKeys,mediaKeys:keys,source:detail.source});
      const now=await state(library);
      const current=now.assets.find(a=>a.folderId===job.folderId&&a.status==='downloaded'&&(familyIds.includes(a.research?.adId)||(a.tags||[]).some(t=>keys.includes(t))));
      const reason=selectionReason({r,brand,platform,mode,country,range:job.filters,keys,familyIds,families,selectedTop,current,knownIds,knownMedia,downloadAllowed:detail.downloadAllowed,downloadReason:detail.downloadReason});
      if(mode==='top'&&!reason)previousDays=rankingDays(r.runningDays,previousDays);
      if(reason) {
        guard.progress();
        if(reason==='ad account needs brand review')job.limitation='Some candidate accounts require brand verification; these candidates have not been included in the saved ranking.';
        const unavailable=!current&&!detail.downloadAllowed&&reason===(detail.downloadReason||'Official download unavailable');
        job.skipped.push({id:r.adId,reason,...(unavailable?{source:detail.source}:{})});
        if(unavailable)job.limitation='Some source creatives cannot be downloaded with the current account; saved ranking excludes these items.';
      }
      else {
        await ensureBrowserWindow();
        const result=await saveCreative(page,library,detail,job.folderId,config.rootFolder,mode==='top'?5:0,['BigSpy验证',mode==='top'?'长投放5星':'最新创意',...keys.slice(0,8)],job.filters.tabId);
        if(result.ratingUpdate)report.ratingUpdates.push(result.ratingUpdate);
        if(result.unavailable) {
          const failed=(await state(library)).assets.find(a=>a.id===result.assetId);
          job.skipped.push({id:r.adId,reason:result.reason,source:detail.source,failedAttempt:failed});
          job.limitation='Some source creatives cannot be downloaded; see each failedAttempt for the official denial or download failure.';
          await writeReport();
          if(failed?.status==='failed')await message(library,{type:'asset.delete',id:failed.id});
          guard.failed(result.errorCode);
          if(!await nextDetail(r.adId))break;
          continue;
        }
        const saved={adId:result.asset.research.adId,candidateAdId:r.adId,assetId:result.asset.id,kind:result.asset.kind,rating:result.asset.rating,runningDays:r.runningDays,filename:result.asset.filename,reused:result.reused,bytes:result.bytes||result.asset.size,sha256:result.sha256};
        guard.saved();
        job.saved.push(saved);keys.forEach(k=>families.add(k));knownIds.add(r.adId);keys.forEach(k=>knownMedia.add(k));
        console.log(JSON.stringify({event:'saved',brand:brand.folder,platform:platform.name,mode,count:job.saved.length,id:r.adId,kind:detail.kind,reused:result.reused}));
      }
      await writeReport();
      if(job.saved.length>=job.target)break;
      if(mode==='new'&&r.firstSeen<job.filters.start&&job.candidates.every(c=>c.firstSeen>=r.firstSeen)){job.stopReason='Latest-first ordering reached creatives older than the requested window';break;}
      if(job.candidates.length>=12&&job.saved.length===0&&job.skipped.length===job.candidates.length&&job.skipped.every(x=>x.reason==='advertiser mismatch')){job.stopReason='The first 12 candidates are different advertisers; refine the search before continuing';break;}
      if(!await nextDetail(r.adId)){job.stopReason='end of currently navigable results';break;}
    }
    finishJob(job);
    await writeReport();
    } catch(error) {
      if(error.code==='COLLECTION_STOP')throw error;
      job.status='failed';job.error=error.message;job.errorStack=error.stack;
      await writeReport();
      await page.screenshot({path:`${out}/job-${report.jobs.length}-attempt-${attempt}-error.png`}).catch(()=>{});
      console.error(JSON.stringify({event:'job_failed',brand:brand.folder,platform:platform.name,mode,error:error.message}));
      throw error;
    }
    },{pending:async()=> (await state(library)).assets.some(a=>a.status==='pending'),diagnose:async(error,attempt)=>{job.attempts||=[];job.attempts.push({attempt,error:error.message,at:new Date().toISOString(),lastCandidate:job.candidates.at(-1)?.id,saved:[...job.saved]});await writeReport();},refresh:async()=>{await checkStop();await loadListing(page,{reload:true});guard.progress();job.refreshes=(job.refreshes||0)+1;}});
  }
  await library.waitForFunction(async ids=>{const s=await chrome.runtime.sendMessage({type:'state'});return ids.every(id=>s.assets.find(a=>a.id===id)?.sourceNote?.status==='downloaded');},report.jobs.flatMap(j=>j.saved.map(a=>a.assetId)),{timeout:15000});
  const after=await state(library);
  for(const original of baseline.assets)assert.deepEqual(after.assets.find(x=>x.id===original.id),report.ratingUpdates.find(u=>u.id===original.id)?.after||original,'Existing asset changed unexpectedly');
  for(const original of baseline.folders)assert.deepEqual(after.folders.find(x=>x.id===original.id),original,'Existing folder changed');
  report.existingAssetsPreserved=baseline.assets.length;
  report.newAssets=after.assets.length-baseline.assets.length;
  report.executionStatus=report.jobs.some(j=>j.status==='failed')?'completed_with_errors':'completed';
  report.finishedAt=new Date().toISOString();report.elapsedSeconds=Math.round((Date.now()-Date.parse(startedAt))/1000);
  report.status=report.jobs.every(j=>j.status==='complete')?'complete':'partial';
  await fs.writeFile(`${out}/after.json`,JSON.stringify(after,null,2));
  await writeReport();
  console.log(JSON.stringify({event:'finished',status:report.status,newAssets:report.newAssets,report:`${out}/report.json`}));
  if(!config.spaceName){await task.finish({keep:[library.label]});await fs.unlink(sessionPath);}
} catch(error) {
  report.executionStatus='stopped';
  await fs.writeFile(`${out}/after.json`,JSON.stringify(await state(library),null,2));
  report.status='failed';report.error=error.stack||String(error);if(error.code)report.errorCode=error.code;
  report.finishedAt=new Date().toISOString();report.elapsedSeconds=Math.round((Date.now()-Date.parse(startedAt))/1000);
  if(report.jobs.at(-1)?.status==='running')report.jobs.at(-1).status='failed';
  await writeReport();
  try{await page.screenshot({path:`${out}/error.png`});}catch{}
  console.error(JSON.stringify({event:'failed',error:error.message,report:`${out}/report.json`}));
  throw error;
}

}
