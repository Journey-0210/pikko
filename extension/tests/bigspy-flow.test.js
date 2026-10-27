import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const content=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
const source=content.slice(content.indexOf('  function chooseNativeVideo('),content.indexOf('  async function collectListingMedia('));
test('native video download supports direct action and selects Video rather than Cover when a menu appears',async()=>{
  let clicked=0;
  const video={textContent:'Download Video',click(){clicked++;}},cover={textContent:'Download Cover',click(){throw Error('Cover must never be selected for video');}};
  let menus=[],observer;
  const scope=vm.createContext({Set,Error,setTimeout,clearTimeout,MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},document:{documentElement:{},querySelectorAll(){return menus;}},adapter:{rendered:()=>true,mediaIdentity:()=> 'same',researchData:()=>({adId:'ad-1'}),permissionBlocked:()=>false}});
  vm.runInContext(source+'\nglobalThis.choose=chooseNativeVideo;',scope);
  const capture={element:{isConnected:true},identity:'same',research:{adId:'ad-1'}};
  await scope.choose(capture,new Set());assert.equal(clicked,0);
  menus=[{querySelectorAll(){return [cover,video];}}];await scope.choose(capture,new Set());assert.equal(clicked,1);
  menus=[];const delayed=scope.choose(capture,new Set());setTimeout(()=>{menus=[{querySelectorAll(){return [cover,video];}}];observer();},600);await delayed;assert.equal(clicked,2,'A menu delayed past 350ms must still select the video');
  await assert.rejects(scope.choose({...capture,identity:'changed'},new Set()),/广告已切换/);
});
