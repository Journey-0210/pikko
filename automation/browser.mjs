import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {normalizeResearch} from '../extension/research.js';

export {ROOT,EXTENSION} from './runtime.mjs';
import {ROOT,EXTENSION} from './runtime.mjs';
export const MARKER = '#pikko-automation-20261026';
export const SEARCH = 'input[data-testid="keyword-search-input"]';
export async function loadListing(page,{reload=false}={}){
 const url='https://app.bigspy.com/en/adspy/ad-library',options={waitUntil:'domcontentloaded',timeout:30000};
 try{if(reload)await page.reload(options);else await page.goto(url,options);}catch(error){
  if(!/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_TIMED_OUT|timed out/i.test(error.message))throw error;
  const ready=await page.evaluate(({url,search})=>location.origin+location.pathname===url&&document.readyState!=='loading'&&!!document.querySelector(search)&&!!document.querySelector('form'),{url,search:SEARCH}).catch(()=>false);
  if(!ready)throw error;
 }
 await page.waitForSelector(SEARCH,{timeout:25000});
}
export function detailReady(previous){
 const d=document.querySelector('[role="dialog"]'),id=d?.innerText.match(/ID:\s*([a-f0-9]{32})/i)?.[1];
 if(!id||id===previous||!d.innerText.includes('Running Days')||!d.querySelector('a[aria-label="Open in new tab"]')?.href.includes(id))return false;
 const key=d.innerText.split(/AI-assisted Features|Creative Analysis|Material Script Analysis/)[0].replace(/\b\d+(?::\d+)*s\b/g,'');
 if(globalThis.__pikkoDetailStable?.key!==key){globalThis.__pikkoDetailStable={key,since:Date.now()};return false;}
 return Date.now()-globalThis.__pikkoDetailStable.since>800;
}
export function listingReady(){
 const form=document.querySelector('form');if(!form)return false;
 const visible=x=>{for(let p=x;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}const r=x.getBoundingClientRect();return r.width>0&&r.height>0;};
 // Preview videos/images load separately from the search result metadata.
 if([...form.querySelectorAll('.ant-spin-spinning')].some(x=>!x.closest('article')&&visible(x)))return false;
 const cards=[...document.querySelectorAll('article')],text=form.innerText;
 if(!cards.length&&!/No results|No data|No ads|\b0 related ads\b|No matching/i.test(text))return false;
 const key=text.split('Advertisers')[0]+cards.slice(0,4).map(x=>(x.textContent||'').replace(/\b\d+(?::\d+)*s\b/g,'')).join('');
 if(globalThis.__pikkoStable?.key!==key){globalThis.__pikkoStable={key,since:Date.now()};return false;}
 return Date.now()-globalThis.__pikkoStable.since>1000;
}
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const state = library => library.evaluate(async()=>await chrome.runtime.sendMessage({type:'state'}));
export async function message(library, data) {
  const result = await library.evaluate(async data=>await chrome.runtime.sendMessage(data), data);
  if (result?.error) throw Error(result.error);
  return result;
}
export async function ensureFolder(library, names) {
  let parentId = null;
  for (const name of names) {
    const s = await state(library);
    const found = s.folders.filter(f=>f.name===name&&(f.parentId||null)===parentId);
    assert.ok(found.length<=1,'Ambiguous folder');
    parentId = found[0]?.id || (await message(library,{type:'folder.create',name,parentId})).id;
  }
  return parentId;
}
export async function bindTab(page, library) {
  await page.evaluate(marker=>history.replaceState(history.state,'',location.pathname+location.search+marker),MARKER);
  return library.evaluate(async marker=>{
    const found=(await chrome.tabs.query({url:'https://app.bigspy.com/*'})).filter(t=>t.url.endsWith(marker));
    if(found.length!==1)throw Error('Automation tab not unique');
    return found[0].id;
  },MARKER);
}
export async function readDetail(library,tabId) {
  return library.evaluate(async tabId=>{
    const [r]=await chrome.scripting.executeScript({target:{tabId},func:async()=>{
      try {
      const adapter=globalThis.AdVaultBigSpyAdapter;
      if(!adapter)throw Error('Installed pikko adapter unavailable');
      if(/\/adspy\/creative\/[a-f0-9]{32}/i.test(location.pathname)){
        const media=[...document.querySelectorAll('img,video')].filter(x=>x.getBoundingClientRect().width>=140&&x.getBoundingClientRect().height>=140);
        const element=media.find(x=>adapter.researchData(x));
        if(element){const download=adapter.findDownload(element);return {research:adapter.researchData(element),source:location.origin+location.pathname+location.search,kind:element.tagName==='VIDEO'?'video':'image',mediaKeys:[adapter.mediaSource(element)].filter(Boolean).map(value=>{const u=new URL(value);return u.origin+u.pathname;}),downloadAllowed:download.ok,downloadReason:download.message||''};}
      }
      let dialog,media,research;
      const deadline=Date.now()+8000;
      while(Date.now()<deadline) {
        dialog=document.querySelector('[role="dialog"]');
        media=[...dialog?.querySelectorAll('img,video')||[]].filter(x=>x.getBoundingClientRect().width>=140&&x.getBoundingClientRect().height>=140);
        research=media.length===1?adapter.researchData(media[0]):null;
        if(research&&dialog.querySelector('a[aria-label="Open in new tab"]')?.href.includes(research.adId))break;
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      if(!research) {
        const adId=dialog?.innerText.match(/ID:\s*([a-f0-9]{32})/i)?.[1];
        const originalPost=dialog?.querySelector('a[href^="https://www.youtube.com/watch?"]');
        if(adId&&originalPost&&!media.length) {
          const source=dialog.querySelector('a[aria-label="Open in new tab"]')?.href;
          if(!source?.includes(adId))throw Error('Creative link does not match its ID');
          const nodes=[...dialog.querySelectorAll('div')];
          const label=name=>nodes.find(x=>x.textContent.trim()===name&&x.nextElementSibling);
          const value=name=>label(name)?.nextElementSibling?.innerText?.trim()||'';
          const advertiser=label('Platform')?.parentElement?.previousElementSibling?.innerText?.split('\n')||[];
          const dates=label('Running Days')?.parentElement?.innerText.match(/(\d{2,4})\/(\d{2})\/(\d{2})\s*[-–~]\s*(\d{2,4})\/(\d{2})\/(\d{2})/);
          const date=(y,m,d)=>`${y.length===2?'20'+y:y}-${m}-${d}`;
          const days=value('Running Days').match(/^(\d[\d,]*)\s*Days?$/i);
          const url=new URL(source);
          const controls=[...dialog.querySelectorAll('button')].filter(x=>x.innerText.trim()==='Download');
          return {nativeOnly:true,source,kind:'video',mediaKeys:[originalPost.href],downloadAllowed:controls.length===1&&!controls[0].disabled&&!adapter.permissionBlocked(controls[0])&&!adapter.visibleAccessGate(),research:{provider:'BigSpy',adId,appType:Number(url.searchParams.get('app_type')),searchFlag:Number(url.searchParams.get('search_flag')),advertiser:advertiser[0],developer:advertiser[1],adAccount:value('Ad Account'),network:value('Platform'),region:value('Area').replace(/\s*\(\d+\)\s*$/,''),language:value('Language'),dimensions:value('Size'),headline:'YouTube video '+new URL(originalPost.href).searchParams.get('v'),...(days?{runningDays:Number(days[1].replaceAll(',',''))}:{}),...(dates?{firstSeen:date(...dates.slice(1,4)),lastSeen:date(...dates.slice(4,7))}:{}),observedAt:new Date().toISOString()}};
        }
        const source=dialog?.querySelector('a[aria-label="Open in new tab"]')?.href;
        if(adId&&source?.includes(adId))return {unsupported:true,adId,source,reason:'Source creative preview/research did not become available within 8 seconds'};
        throw Error('Creative data did not finish loading');
      }
      const source=dialog.querySelector('a[aria-label="Open in new tab"]')?.href;
      const download=adapter.findDownload(media[0]);
      const originalURL=media[0].currentSrc||media[0].src;
      const mediaHost=originalURL?.startsWith('http')?new URL(originalURL).origin:'';
      const urls=[...dialog.querySelectorAll('img,video')].filter(x=>x===media[0]||(mediaHost&&x.src?.startsWith(mediaHost+'/'))).map(x=>x.currentSrc||x.src||x.poster).filter(Boolean).map(value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return '';}}).filter(Boolean);
      return {research,source,kind:media[0].tagName==='VIDEO'?'video':'image',mediaKeys:urls,downloadAllowed:download.ok,downloadReason:download.message||''};
      } catch(error) { return {error:error.message}; }
    }});
    if(!r?.result||r.result.error||r.error)throw Error(r?.result?.error||r?.error?.message||'Page extraction failed');
    return r.result;
  },tabId);
}
export async function saveCreative(page,library,detail,folderId,folderSearch,rating,tags,tabId) {
  const before=await state(library);
  const keys=detail.familyKeys||detail.mediaKeys.map(u=>'pk:'+digest(u).slice(0,24));
  const ids=detail.familyIds||[detail.research.adId];
  const existing=before.assets.find(a=>a.folderId===folderId&&a.status==='downloaded'&&(ids.includes(a.research?.adId)||(a.tags||[]).some(t=>keys.includes(t))));
  if(existing) {
    if(rating===5&&existing.rating!==5) {
      assert.ok(existing.tags?.includes('BigSpy验证'),'Only this workflow\'s own captured records may be promoted to five stars');
      await message(library,{type:'asset.update',id:existing.id,patch:{rating:5}});
      const updated=(await state(library)).assets.find(a=>a.id===existing.id);
      return {asset:updated,reused:true,ratingUpdate:{id:existing.id,before:existing,after:updated}};
    }
    return {asset:existing,reused:true};
  }
  if(before.assets.some(a=>a.status==='pending'))throw Error('Another download is pending; resume after it completes');
  if(!detail.downloadAllowed)throw Error(detail.downloadReason||'Official download unavailable');
  const title=`${detail.research.advertiser} · ${detail.research.headline||detail.research.adId}`.slice(0,180);
  if(detail.nativeOnly) {
    const result=await library.evaluate(async({tabId,data})=>{
      const [result]=await chrome.scripting.executeScript({target:{tabId},args:[data],func:async data=>{
        const adapter=globalThis.AdVaultBigSpyAdapter,d=document.querySelector('[role="dialog"]');
        const valid=()=>d?.innerText.includes('ID: '+data.research.adId)&&!adapter.visibleAccessGate();
        const buttons=[...d?.querySelectorAll('button')||[]].filter(x=>x.innerText.trim()==='Download');
        if(!valid()||buttons.length!==1||buttons[0].disabled||adapter.permissionBlocked(buttons[0]))return {error:'Official download is unavailable'};
        const armed=await chrome.runtime.sendMessage({type:'capture.arm',data});
        if(armed?.error||!armed?.assetId)return armed||{error:'Capture was not armed'};
        try {
          if(!valid())throw Error('Creative changed before download');
          buttons[0].click();
          const until=Date.now()+2500;
          while(Date.now()<until) {
            if(adapter.visibleAccessGate())throw Error('BigSpy denied official download');
            const choices=[...document.querySelectorAll('[role="menuitem"]')].filter(x=>x.innerText.trim()==='Download Video'&&adapter.rendered(x));
            if(choices.length>1)throw Error('Ambiguous video download menu');
            if(choices.length===1){if(adapter.permissionBlocked(choices[0]))throw Error('Video download denied');choices[0].click();break;}
            await new Promise(r=>setTimeout(r,50));
          }
          return armed;
        }catch(error){await chrome.runtime.sendMessage({type:'capture.cancel',assetId:armed.assetId});return {error:error.message};}
      }});
      return result?.result;
    },{tabId,data:{folderId,title,notes:`BigSpy ${detail.research.runningDays} 天；通过官方下载保存视频。`,tags,rating,kind:'video',platform:'Google',research:detail.research,allowMissingReferrer:false}});
    if(!result?.assetId||result.error)throw Error(result?.error||'Official video download did not start');
    try {
      await library.waitForFunction(async id=>{const s=await chrome.runtime.sendMessage({type:'state'});const a=s.assets.find(x=>x.id===id);return a?.downloadId!=null||a?.status!=='pending';},result.assetId,{timeout:30000});
    } catch(error) {
      const pending=(await state(library)).assets.find(x=>x.id===result.assetId);
      if(pending?.status==='pending'&&pending.downloadId==null) {
        await message(library,{type:'capture.cancel',assetId:result.assetId});
        return {unavailable:true,assetId:result.assetId,reason:'Official Download returned no file within 30 seconds; source preview was also unavailable'};
      }
      throw error;
    }
  } else {
  const kindLabel=detail.kind==='video'?'收藏这段视频到 pikko.':'收藏这张图片到 pikko.';
  await page.click(`loc=role:button[name="${kindLabel}"]`,{timeout:10000});
  await page.waitForSelector('loc=role:dialog[name="收藏素材到 pikko."]',{timeout:10000});
  await page.fill('loc=role:textbox[name="素材标题"]',title);
  await page.fill('loc=role:textbox[name="素材备注"]',`BigSpy ${detail.research.runningDays} 天；${rating===5?'本期长投放精选':'本期新素材'}；${detail.research.firstSeen} 至 ${detail.research.lastSeen}。`);
  await page.fill('loc=role:textbox[name="标签，用逗号分隔"]',tags.join(','));
  if(rating)await page.click(`loc=role:button[name="${rating} 星"]`,{timeout:10000});
  await page.fill('loc=role:textbox[name="搜索文件夹"]',folderSearch);
  const chain=[];let current=before.folders.find(f=>f.id===folderId);
  while(current){chain.unshift(current.name);current=before.folders.find(f=>f.id===current.parentId);}
  await page.click(`loc=role:button[name="选择文件夹 ${chain.join(' / ')}"]`,{timeout:10000});
  await page.click('loc=role:button[name="保存"]',{timeout:10000});
  }
  await library.waitForFunction(async({folderId,adId,beforeIds})=>{
    const s=await chrome.runtime.sendMessage({type:'state'});
    const a=s.assets.find(a=>a.folderId===folderId&&a.research?.adId===adId&&!beforeIds.includes(a.id));
    return a&&a.status!=='pending';
  },{folderId,adId:detail.research.adId,beforeIds:before.assets.map(a=>a.id)},{timeout:135000});
  let a=(await state(library)).assets.find(a=>a.folderId===folderId&&a.research?.adId===detail.research.adId&&!before.assets.some(b=>b.id===a.id));
  if(a?.status==='failed')return {unavailable:true,assetId:a.id,reason:a.error,errorCode:a.errorCode};
  assert.equal(a?.status,'downloaded',a?.error||'Download not confirmed');
  assert.equal(a.rating,rating);
  assert.equal(a.kind,detail.kind);
  const expectedResearch=normalizeResearch(detail.research);
  for(const [key,value] of Object.entries(expectedResearch))if(key!=='observedAt')assert.deepEqual(a.research?.[key],value,'Saved BigSpy data mismatch: '+key);
  const bytes=await fs.readFile(a.filename);
  assert.ok(bytes.length>100,'Original file missing or empty');
  if(detail.source&&a.sourcePage!==detail.source) {
    await message(library,{type:'asset.update',id:a.id,patch:{sourcePage:detail.source}});
    a=(await state(library)).assets.find(x=>x.id===a.id);
  }
  return {asset:a,sha256:digest(bytes),bytes:bytes.length,reused:false};
}
