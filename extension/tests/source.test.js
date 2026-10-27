import test from 'node:test';
import assert from 'node:assert/strict';
import {safePage,sourceNote} from '../core.js';

test('source links retain public IDs without persisting credentials, tracking or access tokens',()=>{
  assert.equal(safePage('https://user:pass@www.facebook.com/ads/library/?id=123456&access_token=secret&fbclid=track#private'),'https://www.facebook.com/ads/library/?id=123456');
  assert.equal(safePage('https://www.facebook.com/permalink.php?story_fbid=234&id=567&token=secret'),'https://www.facebook.com/permalink.php?id=567&story_fbid=234');
  assert.equal(safePage('https://www.facebook.com/watch/?v=123'),'https://www.facebook.com/watch/?v=123');
  assert.equal(safePage('https://bigspy.com/ad?ad_id=123&signature=secret'),'https://bigspy.com/ad?ad_id=123');
  assert.equal(safePage('https://www.youtube.com/watch?v=T6322VrmjJg&si=tracking'),'https://www.youtube.com/watch?v=T6322VrmjJg');
  for(const u of ['https://facebook.com.evil.test/ads/library/?id=123','https://www.facebook.com/ads/library/?id=secret','https://www.facebook.com/ads/library/?id=123&id=456'])assert(!safePage(u).includes('?'));
  for(const u of ['javascript:alert(1)','file:///private','not a URL'])assert.equal(safePage(u),'');
  const note=sourceNote({sourcePage:'https://www.facebook.com/ads/library/?id=123&token=secret',title:'测试',relativePath:'a.mp4'});
  assert(note.includes('?id=123'));assert(!note.includes('secret'));assert(note.includes('旧记录'));assert.throws(()=>sourceNote({}));
});

test('source sidecar follows actual filename, tracks completion independently, retries and recovers',async()=>{
  let vault={schema:2,settings:{},folders:[{id:'inbox',name:'Inbox',parentId:null}],assets:[]},session={},handlers={},items={},requests=[],next=700;
  const storage=()=>({get:async()=>({vault:structuredClone(vault)}),set:async data=>{vault=structuredClone(data.vault);}});
  globalThis.chrome={runtime:{id:'qa-source',onMessage:{addListener:f=>handlers.message=f}},storage:{local:storage(),session:{get:async()=>structuredClone(session),set:async v=>Object.assign(session,structuredClone(v)),remove:async k=>{delete session[k];}}},tabs:{sendMessage:async()=>{}},downloads:{onDeterminingFilename:{addListener:f=>handlers.filename=f},onChanged:{addListener:f=>handlers.changed=f},onErased:{addListener:f=>handlers.erased=f},search:async({id})=>items[id]?[items[id]]:[],download:async options=>{requests.push(options);const id=next++;items[id]={id,state:'in_progress',filename:'/Downloads/'+options.filename};return id;}}};
  const tick=()=>new Promise(r=>setTimeout(r,20));
  chrome.downloads.onCreated={addListener:f=>handlers.created=f};
  const until=async predicate=>{const end=Date.now()+2000;while(!predicate()){assert.ok(Date.now()<end,'Queued sidecar did not reach expected state');await tick();}};
  await import('../background.js?source-test');await tick();
  const msg=m=>new Promise(resolve=>handlers.message(m,{id:'qa-source'},resolve));
  await msg({type:'state'}); // Drain startup reconciliation before adding the fixture.
  vault.assets.push({id:'a',status:'pending',downloadId:100,sourcePage:'https://www.facebook.com/ads/library/?id=123',sourceLinkVersion:1,title:'QA',kind:'image'});
  items[100]={id:100,state:'complete',filename:'/Downloads/AdVault/nested/QA (1).jpg',mime:'image/jpeg',fileSize:100};
  handlers.changed({id:100,state:{current:'complete'}});await until(()=>requests.length===1);
  assert.equal(requests.length,1);assert.equal(requests[0].filename,'AdVault/nested/QA (1).jpg.source.txt');
  assert(decodeURIComponent(requests[0].url).includes('?id=123'));assert.equal(vault.assets[0].status,'downloaded');assert.equal(vault.assets[0].sourceNote.status,'pending');
  assert((await msg({type:'asset.source-note',id:'a'})).error);
  let suggestion;handlers.filename({id:700,byExtensionId:'qa-source',url:requests[0].url,mime:'text/plain'},v=>suggestion=v);await tick();assert.equal(suggestion.filename,requests[0].filename);
  items[700].state='interrupted';handlers.changed({id:700,state:{current:'interrupted'}});await tick();assert.equal(vault.assets[0].sourceNote.status,'failed');assert.equal(vault.assets[0].status,'downloaded');
  assert((await msg({type:'asset.source-note',id:'a'})).ok);await tick();items[701].state='complete';
  await import('../background.js?source-restart');await tick();assert.equal(vault.assets[0].sourceNote.status,'downloaded');assert.equal(vault.assets[0].sourceNote.relativePath,'nested/QA (1).jpg.source.txt');
  handlers.changed({id:100,state:{current:'complete'}});await tick();assert.equal(requests.length,2,'duplicate media events must not re-export sidecars');
  assert((await msg({type:'asset.source-note',id:'a'})).ok);await tick();items[702]={...items[702],state:'complete',filename:'/Downloads/download.txt'};handlers.changed({id:702,state:{current:'complete'}});await tick();assert.equal(vault.assets[0].sourceNote.status,'failed','wrong directory must never claim beside-original success');assert.equal(vault.assets[0].status,'downloaded');
  chrome.downloads.download=async()=>{throw Error('private token');};assert((await msg({type:'asset.source-note',id:'a'})).ok);await tick();assert.equal(vault.assets[0].sourceNote.status,'failed');assert(!JSON.stringify(vault).includes('private token'));assert.equal(vault.assets[0].status,'downloaded');
  vault.assets.push({id:'missing',status:'downloaded',relativePath:'missing.jpg'});assert((await msg({type:'asset.source-note',id:'missing'})).error);
  assert.equal(requests.length,3);
  const imported=await msg({type:'asset.import',asset:{folderId:'inbox',blobId:'local-video',kind:'video',title:'Imported',sourcePage:'https://www.facebook.com/ads/library/?id=123&access_token=secret'}});
  assert.equal(imported.asset.sourcePage,'https://www.facebook.com/ads/library/?id=123');assert.equal(imported.asset.sourceLinkVersion,1);assert.equal(imported.asset.blobId,'local-video');
  assert((await msg({type:'asset.update',id:imported.id,patch:{sourcePage:'https://adstransparency.google.com/advertiser/AR1/creative/CR2?region=MY&token=secret'}})).ok);
  const repaired=vault.assets.find(x=>x.id===imported.id);assert.equal(repaired.sourcePage,'https://adstransparency.google.com/advertiser/AR1/creative/CR2');assert.equal(repaired.blobId,'local-video');assert.equal(repaired.rating,0);
  assert((await msg({type:'asset.update',id:imported.id,patch:{sourcePage:'javascript:alert(1)'}})).error);assert.equal(vault.assets.find(x=>x.id===imported.id).sourcePage,repaired.sourcePage);
  const count=vault.assets.length;assert((await msg({type:'asset.import',asset:{folderId:'inbox',blobId:'bad',sourcePage:'javascript:alert(1)'}})).error);assert.equal(vault.assets.length,count);
});
