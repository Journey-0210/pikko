import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {observeDownloadResponse} from '../download-response.js';
test('official quota denial is observed without changing requests or accepting unrelated 403s',async()=>{
  const events=[],timers=new Set();let status=403,body={id:'COUNT EXHAUSTED'};
  const originalFetch=async()=>({status,clone:()=>({text:async()=>JSON.stringify(body)})});
  class XHR{open(){}send(){this.status=status;this.responseType='json';this.response=body;this.load();}addEventListener(_,fn){this.load=fn;}}
  const window={fetch:originalFetch,dispatchEvent:e=>events.push(e.detail)};
  const context=vm.createContext({window,XMLHttpRequest:XHR,URL,WeakMap,Reflect,location:{href:'https://app.bigspy.com/en/adspy/',origin:'https://app.bigspy.com'},CustomEvent:class{constructor(_,data){this.detail=data.detail;}},setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)});
  const install=()=>vm.runInContext(`(${observeDownloadResponse.toString()})('asset-1')`,context);
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  install();await window.fetch('/unrelated');await flush();assert.equal(events.length,0);
  await window.fetch('https://other.example/napi/v1/bs-download/creative');await flush();assert.equal(events.length,0);
  await window.fetch('/napi/v1/bs-download/creative');await flush();assert.equal(events[0].reason,'official-count-limit');assert.equal(events[0].assetId,'asset-1');assert.equal(window.fetch,originalFetch);
  events.length=0;install();status=200;await window.fetch('/napi/v1/bs-download/creative');await flush();assert.equal(events[0].status,200);assert.equal(events[0].reason,undefined);events.length=0;
  status=403;body={id:'FORBIDDEN'};const xhr=new XHR();xhr.open('GET','/napi/v1/bs-download/creative');xhr.send();assert.equal(events[0].reason,'official-denied');assert.equal(timers.size,0);
});
