import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
import {saveCreative} from '../browser.mjs';import {observeDownloadResponse} from '../../extension/download-response.js';import {progressGuard} from '../safety.mjs';
test('B07 B08 B09: real observer -> content bridge -> background -> saveCreative -> run guard; no-event 200 never becomes success',async()=>{
 const local={},session={},handlers={},listeners={};let now=Date.now(),responseStatus=403,responseBody={id:'COUNT EXHAUSTED'};
 const storage=area=>({get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(area[k])])),set:async data=>Object.assign(area,structuredClone(data)),remove:async key=>{delete area[key];}});
 const sender={id:'qa-chain',tab:{id:8,url:'https://app.bigspy.com/adspy/ad-library'},url:'https://app.bigspy.com/adspy/ad-library',frameId:0};
 globalThis.chrome={storage:{local:storage(local),session:storage(session)},runtime:{id:sender.id,onMessage:{addListener:f=>handlers.message=f},sendMessage:m=>new Promise(resolve=>handlers.message(m,sender,resolve))},tabs:{sendMessage:async()=>{}},downloads:{onCreated:{addListener:f=>handlers.created=f},onDeterminingFilename:{addListener:f=>handlers.filename=f},onChanged:{addListener:f=>handlers.changed=f},onErased:{addListener:f=>handlers.erased=f},search:async()=>[]},scripting:{executeScript:async({func,args=[]})=>[{result:await func(...args)}]}};
 const RealDate=Date;globalThis.Date=class extends RealDate{static now(){now+=100;return now;}};
 globalThis.window={addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:e=>listeners[e.type]?.(e),fetch:async()=>({status:responseStatus,clone:()=>({text:async()=>JSON.stringify(responseBody)})})};
 globalThis.location={origin:'https://app.bigspy.com',href:sender.url};globalThis.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail;}};
 globalThis.XMLHttpRequest=class{open(){}send(){}};
 const native={innerText:'Download',disabled:false,click(){window.fetch('/napi/v1/bs-download/creative');}};
 const adId='02e475119f230db575363f02e44ed9b7';
 const dialog={innerText:'ID: '+adId,querySelectorAll:()=>[native]};
 globalThis.document={querySelector:()=>dialog,querySelectorAll:()=>[]};globalThis.AdVaultBigSpyAdapter={visibleAccessGate:()=>false,permissionBlocked:()=>false};
 const content=await fs.readFile(new URL('../../extension/content.js',import.meta.url),'utf8');
 const bridge=content.slice(content.indexOf("  window.addEventListener('pikko-official-download-denied'"),content.indexOf("  const host = document.createElement('div');"));
 vm.runInNewContext(bridge,{window,message:m=>chrome.runtime.sendMessage(m)});
 await import('../../extension/background.js?download-chain');
 const lib={evaluate:async(fn,arg)=>fn(arg),waitForFunction:async(fn,arg)=>{for(let i=0;i<20;i++){if(await fn(arg))return;await new Promise(r=>setTimeout(r,2));}throw Error('Fixture condition timeout');}};
 const detail={nativeOnly:true,research:{provider:'BigSpy',adId,appType:2,searchFlag:145459,advertiser:'Tambadana',firstSeen:'2026-10-24',lastSeen:'2026-10-27',runningDays:4},kind:'video',mediaKeys:[],downloadAllowed:true};
 try{
 const result=await saveCreative({},lib,detail,'inbox','QA',0,[],8);assert.equal(result.errorCode,'official-count-limit');assert.equal(result.unavailable,true);assert.throws(()=>progressGuard().failed(result.errorCode),{code:'DOWNLOAD_COUNT_LIMIT'});
 let s=await chrome.runtime.sendMessage({type:'state'});assert.equal(s.waitingCaptureId,null);assert.equal(s.assets[0].downloadId,undefined);
 const trace=await chrome.runtime.sendMessage({type:'capture.trace'});assert.ok(trace.events.some(e=>e.event==='official.response'&&e.status===403));
 // The same real arm cannot be ended by an error from a different tab.
 const armed=await chrome.runtime.sendMessage({type:'capture.arm',data:{folderId:'inbox',kind:'video',research:detail.research}});
 const wrong=await new Promise(resolve=>handlers.message({type:'capture.blocked',assetId:armed.assetId,reason:'official-count-limit'},{...sender,tab:{id:9}},resolve));assert.ok(wrong.error);assert.equal((await chrome.runtime.sendMessage({type:'state'})).waitingCaptureId,armed.assetId);
 // HTTP 200 only acknowledges the request. No download event means pending until expiry.
 responseStatus=200;await window.fetch('/napi/v1/bs-download/creative');await new Promise(r=>setTimeout(r,5));s=await chrome.runtime.sendMessage({type:'state'});assert.equal(s.assets[0].status,'pending');
 now+=120001;s=await chrome.runtime.sendMessage({type:'state'});assert.equal(s.assets[0].status,'failed');assert.equal(s.waitingCaptureId,null);assert.equal(s.assets[0].downloadId,undefined);
 }finally{globalThis.__pikkoDownloadResponseStop?.();globalThis.Date=RealDate;}
});
