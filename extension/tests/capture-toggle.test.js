import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {syncCaptureFrame,syncCaptureTabs} from '../capture-control.js';
const source=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const lifecycle=source.slice(source.indexOf('  const observer = new MutationObserver(scheduleScan);'),source.indexOf('  try {\n    chrome.runtime.onMessage.addListener'));
test('capture switch stops scanners, clears badges, restores one scanner and respects stored off state',async()=>{
  let onChange,resolvePreference,observing=false,cleared=0,closed=0,scans=0;const timers=new Set(),listeners=new Set();
  const target={addEventListener:n=>listeners.add(n),removeEventListener:n=>listeners.delete(n)};
  const context=vm.createContext({disposed:false,captureEnabled:false,scanTimer:null,window:target,document:{...target,documentElement:{}},MutationObserver:class{observe(){observing=true;}disconnect(){observing=false;}},scheduleScan(){scans++;},setInterval(){const id={};timers.add(id);return id;},clearInterval:id=>timers.delete(id),clearTimeout(){},closePicker(){closed++;},badges:{replaceChildren(){cleared++;}},mediaButtons:new Map([['image','badge']]),chrome:{storage:{onChanged:{addListener(fn){onChange=fn;}},local:{get(){return new Promise(resolve=>{resolvePreference=resolve;});}}}}});
  vm.runInContext(lifecycle,context);
  resolvePreference({captureEnabled:false});await Promise.resolve();assert.equal(observing,false);assert.equal(scans,0);
  onChange({captureEnabled:{newValue:true}},'local');assert.equal(observing,true);assert.equal(timers.size,1);assert.equal(listeners.size,4);
  onChange({captureEnabled:{newValue:true}},'local');assert.equal(timers.size,1);
  onChange({captureEnabled:{newValue:false}},'local');assert.equal(observing,false);assert.equal(timers.size,0);assert.equal(listeners.size,0);assert.equal(closed,1);assert.equal(cleared,1);assert.equal(context.mediaButtons.size,0);
  onChange({captureEnabled:{newValue:true}},'sync');assert.equal(observing,false);
  onChange({captureEnabled:{newValue:true}},'local');assert.equal(observing,true);assert.equal(timers.size,1);
});
test('popup switch persists its value and restores the checked state if saving fails',async()=>{
  const popup=fs.readFileSync(new URL('../popup.js',import.meta.url),'utf8');
  const control={},writes=[],errors=[];let fail=false;
  const context=vm.createContext({$:()=>control,status:(message)=>errors.push(message),syncCaptureTabs:async()=>[],chrome:{storage:{local:{get:async()=>({captureEnabled:false}),set:async value=>{if(fail)throw Error('storage unavailable');writes.push(value.captureEnabled);}},onChanged:{addListener(){}}}}});
  vm.runInContext(popup.slice(popup.indexOf('const captureSwitch='),popup.indexOf("$('create-form').addEventListener")),context);
  await new Promise(setImmediate);assert.equal(control.checked,false);assert.equal(control.disabled,false);
  control.checked=true;await control.onchange();assert.deepEqual(writes,[true]);assert.equal(control.disabled,false);
  fail=true;control.checked=false;await control.onchange();assert.equal(control.checked,true);assert.equal(control.disabled,false);assert.equal(errors[0],'storage unavailable');
});
test('a reload orphan is hidden even when its old observer reattaches it; live capture gets the switch directly',()=>{
  const properties={},root={id:'ad-vault-v2-capture-root',connected:true,style:{setProperty:(name,value,priority)=>{properties[name]={value,priority};}},removeAttribute(){this.id='';},remove(){this.connected=false;}};
  const mainWindow={};mainWindow.top=mainWindow;
  const context=vm.createContext({window:mainWindow,document:{querySelectorAll:()=>[root]}});
  vm.runInContext(`globalThis.sync=${syncCaptureFrame.toString()}`,context);
  assert.equal(context.sync(false),true);assert.equal(root.connected,false);assert.equal(root.id,'');
  root.connected=true;assert.deepEqual(properties.display,{value:'none',priority:'important'},'old observers cannot make an orphan visible again');
  let value;context.__pikkoCaptureControl=enabled=>{value=enabled;};
  assert.equal(context.sync(true),false);assert.equal(value,true);
  assert.equal(context.sync(false),false);assert.equal(value,false);
  context.window={top:{}};context.location={hostname:'third-party.test',pathname:'/embed'};
  value=null;assert.equal(context.sync(true),false);assert.equal(value,null,'unmatched third-party frames remain untouched');
  context.location={hostname:'adstransparency.google.com',pathname:'/adframe'};
  context.sync(true);assert.equal(value,true);
});
test('popup repairs stale tabs, leaves live scripts alone and reports inaccessible active pages',async()=>{
  const calls=[];globalThis.chrome={tabs:{query:async()=>[{id:1,url:'https://app.bigspy.com/'},{id:2,url:'https://example.com/'},{id:3,url:'https://restricted.test/',active:true},{id:4,url:'chrome://extensions/'}]},scripting:{executeScript:async options=>{calls.push(options);if(options.target.tabId===3)throw Error('no access');return [{result:options.target.tabId===1}];}}};
  try{
    const results=await syncCaptureTabs(false);
    assert.deepEqual(calls.filter(call=>call.files).map(call=>call.target.tabId),[1]);
    assert(calls.filter(call=>call.func).every(call=>call.args[0]===false));
    assert(!calls.some(call=>call.target.tabId===4));
    assert.deepEqual(results.find(result=>result.tabId===3),{tabId:3,ok:false,active:true});
  }finally{delete globalThis.chrome;}
});

// Execute the whole content script without opening popup.js. Share storage
// between fresh page contexts to model navigation, refresh and browser reopen.
function loadPage(storage, getPreference) {
  const events=new Map(),timers=new Map(),intervals=new Set(),mounted=new Set();
  let preferenceListener,scanCount=0;
  function node(){return {style:{},setAttribute(){},append(){},replaceChildren(){},remove(){mounted.delete(this);},attachShadow(){return node();},get isConnected(){return mounted.has(this);}};}
  const document={createElement:node,documentElement:{append(item){mounted.add(item);}},querySelectorAll(selector){if(selector==='img, video')scanCount++;return [];},addEventListener(){},removeEventListener(){}};
  const window={addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}};
  const context=vm.createContext({document,window,AdVaultBigSpyAdapter:{},Date,MutationObserver:class{observe(){}disconnect(){}},setTimeout(fn){const id={};timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},setInterval(){const id={};intervals.add(id);return id;},clearInterval(id){intervals.delete(id);},chrome:{runtime:{id:'test-pikko',onMessage:{addListener(){}}},storage:{local:{get:getPreference||(()=>Promise.resolve({...storage}))},onChanged:{addListener(fn){preferenceListener=fn;},removeListener(){}}}}});
  vm.runInContext(source,context);
  return {context,mounted,intervals,get scans(){return scanCount;},change(enabled){storage.captureEnabled=enabled;preferenceListener({captureEnabled:{newValue:enabled}},'local');},event(name,event){events.get(name)?.(event);},flush(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}}};
}
test('saved off stays off on new pages, refresh and reopen, without ever opening the popup',async()=>{
  const storage={captureEnabled:false};
  for(let navigation=0;navigation<3;navigation++){
    const page=loadPage(storage);
    assert.equal(page.mounted.size,0,'no overlay is mounted while preference is loading');
    await new Promise(setImmediate);page.flush();
    assert.equal(page.mounted.size,0);assert.equal(page.scans,0);assert.equal(page.intervals.size,0);
    page.event('pagehide',{persisted:false});
  }
});
test('returning to a cached page reads the saved off state before restarting capture',async()=>{
  const storage={captureEnabled:true},page=loadPage(storage);
  await new Promise(setImmediate);page.flush();assert.equal(page.scans,1);
  page.event('pagehide',{persisted:true});assert.equal(page.intervals.size,0);
  storage.captureEnabled=false; // No storage event delivered while the page was frozen.
  page.event('pageshow',{persisted:true});
  await new Promise(setImmediate);page.flush();assert.equal(page.scans,1);assert.equal(page.intervals.size,0);
  page.change(true);page.flush();assert.equal(page.scans,2);assert.equal(page.intervals.size,1);
  page.event('pagehide',{persisted:true});storage.captureEnabled=false;
  page.event('pageshow',{persisted:true});await new Promise(setImmediate);page.flush();assert.equal(page.scans,2);assert.equal(page.intervals.size,0);
});
test('a delayed initial preference cannot override a newer off command; unreadable storage stays off',async()=>{
  let resolve;const page=loadPage({},()=>new Promise(done=>{resolve=done;}));
  page.context.__pikkoCaptureControl(false);resolve({captureEnabled:true});
  await new Promise(setImmediate);page.flush();assert.equal(page.scans,0);assert.equal(page.mounted.size,0);
  const unavailable=loadPage({},()=>Promise.reject(Error('storage unavailable')));
  await new Promise(setImmediate);unavailable.flush();assert.equal(unavailable.scans,0);assert.equal(unavailable.mounted.size,0);
});
