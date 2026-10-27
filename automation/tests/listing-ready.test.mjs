import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {listingReady} from '../browser.mjs';
test('search metadata can become ready while preview loaders and video-duration text keep changing; blocking search spinner still waits',()=>{
 let time=0,duration='0s',blocking=false;
 const body={},preview={closest:()=>({})},search={closest:()=>null,parentElement:body,getBoundingClientRect:()=>({width:10,height:10})};
 const form={innerText:'Time Last 30 Days Advertisers',querySelectorAll:()=>blocking?[search]:[preview]};
 const card={get textContent(){return 'Tambadana '+duration+' Running Days 31';}};
 const c=vm.createContext({document:{body,querySelector:()=>form,querySelectorAll:()=>[card]},getComputedStyle:()=>({opacity:'1',visibility:'visible',display:'block'}),Date:{now:()=>time}});
 const ready=()=>vm.runInContext(`(${listingReady.toString()})()`,c);
 assert.equal(ready(),false);time=1500;duration='2s';assert.equal(ready(),true);blocking=true;assert.equal(ready(),false);
});
