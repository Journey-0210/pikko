import assert from 'node:assert/strict';
import * as c from '../core.js';
let local={},session={},handlers={},downloads={},notifications=[];
const storage=(area)=>({async get(keys){if(typeof keys==='string')keys=[keys];return Object.fromEntries(keys.map(k=>[k,structuredClone(area[k])]));},async set(data){Object.assign(area,structuredClone(data));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete area[key];}});
globalThis.chrome={storage:{local:storage(local),session:storage(session)},runtime:{id:'qa',onMessage:{addListener(f){handlers.message=f;}},async openOptionsPage(){}},tabs:{async sendMessage(...a){notifications.push(a);}},downloads:{onDeterminingFilename:{addListener(f){handlers.filename=f;}},onChanged:{addListener(f){handlers.changed=f;}},onErased:{addListener(f){handlers.erased=f;}},async search({id}){return downloads[id]?[downloads[id]]:[];},async show(){}}};
const tick=()=>new Promise(r=>setTimeout(r,10));const sender={id:'qa',url:'https://bigspy.com/ad/42?token=secret#private',tab:{id:8,url:'https://bigspy.com/ad/42'}};
chrome.scripting={async executeScript(){return [{result:undefined}];}};
chrome.downloads.onCreated={addListener(f){handlers.created=f;}};
// Keep provenance downloads independent of the deliberately stalled media mocks.
let mediaDownload,failFolderWrite=false;Object.defineProperty(chrome.downloads,'download',{get(){return options=>{if(options.url.startsWith('data:application/json')){if(failFolderWrite)return Promise.reject(Error('DISK_FULL'));const id=9000+Object.keys(downloads).length;downloads[id]={id,state:'complete',filename:'/Downloads/'+options.filename,exists:true};return Promise.resolve(id);}return options.url.startsWith('data:text/plain')?Promise.reject(new Error('QA sidecar blocked')):mediaDownload(options);};},set(fn){mediaDownload=fn;}});
const msg=(m,s=sender)=>new Promise(r=>handlers.message(m,s,r));
await import('../background.js?qa');await tick();
const report=[];function pass(s){report.push(s);console.log('PASS '+report.length+': '+s);}
const originalFolderCount=(await msg({type:'state'})).folders.length;failFolderWrite=true;assert((await msg({type:'folder.create',name:'Should not commit'})).error);failFolderWrite=false;assert.equal((await msg({type:'state'})).folders.length,originalFolderCount);pass('Failed local directory write never creates a library-only success record');
let folders=[];folders=c.createFolder(folders,{name:'品牌'},'root');for(let i=1;i<6;i++)folders=c.createFolder(folders,{name:'子'+i,parentId:i===1?'root':'f'+(i-1)},'f'+i);assert.equal(c.folderChain(folders,'f5').length,6);assert.throws(()=>c.createFolder(folders,{name:'too deep',parentId:'f5'},'f6'));assert.throws(()=>c.createFolder(folders,{name:'品牌'},'again'));assert.throws(()=>c.deleteFolder(folders,[],'root'));assert.throws(()=>c.folderChain([{id:'cycle',parentId:'cycle'}],'cycle'));pass('Folder tree depth, duplicate siblings, nonempty deletion and cycles guarded');
for(const path of ['/home/u/Downloads/AdVault/a/b.mp4','C:\\Users\\A\\Downloads\\AdVault\\a\\b.mp4','AdVault/a/b.mp4'])assert.equal(c.relativeActual(path),'a/b.mp4');for(const path of ['/tmp/evil.mp4','/AdVault/../a.mp4','/AdVault/a//b.mp4','/AdVault/a/./b.mp4'])assert.equal(c.relativeActual(path),null);pass('Relative actual file path maps Unix/Windows and rejects traversal/outside roots');
const m=c.metadata({rating:99,tags:['a','a',' b '],platform:'unknown'});assert.equal(m.rating,5);assert.deepEqual(m.tags,['a','b']);assert.equal(m.platform,'其他');pass('Metadata rating bounds and tags normalization');
const created=await msg({type:'folder.create',name:'Acme'});assert(created.ok);let state=await msg({type:'state'});const id=created.id;await msg({type:'folder.rename',id,name:'Renamed'});assert.equal((await msg({type:'state'})).folders.find(f=>f.id===id).name,'Renamed');pass('Folder CRUD persistence and rename stable identity');
assert((await msg({type:'capture.arm',data:{folderId:id,title:'Ad'}},{...sender,url:'https://evil.test'})).error);const armed=await msg({type:'capture.arm',data:{folderId:id,title:'Ad',kind:'video',rating:4,tags:['test']}});assert(armed.ok);assert((await msg({type:'capture.arm',data:{folderId:id}})).error);assert((await msg({type:'asset.delete',id:armed.assetId})).error);assert((await msg({type:'folder.delete',id})).error);pass('Capture caller origin, single active capture, pending asset/nonempty folder deletion gates');
let suggested,count=0;const item={id:77,filename:'a.mp4',mime:'video/mp4',referrer:'https://bigspy.com/ad/42',startTime:new Date(Date.now()+10).toISOString(),state:'in_progress'};handlers.filename({...item,mime:'text/html'},v=>{count++;suggested=v;});await tick();assert.equal(count,1);assert.equal(suggested,undefined);assert(session.arm);downloads[77]=item;handlers.filename(item,v=>suggested=v);await tick();assert(suggested.filename.startsWith('AdVault/'));assert(!session.arm);assert.equal((await msg({type:'state'})).assets[0].status,'pending');downloads[77]={...item,state:'complete',filename:'/tmp/Downloads/'+suggested.filename,fileSize:100};handlers.changed({id:77,state:{current:'complete'}});await tick();state=await msg({type:'state'});let asset=state.assets.find(a=>a.id===armed.assetId);assert.equal(asset.status,'downloaded');assert(asset.relativePath);assert.equal(asset.sourcePage,'https://bigspy.com/ad/42');assert(!asset.blobId);pass('Native capture ignores MIME spoof, consumes once, downloaded status not imported, safe metadata');
await msg({type:'asset.update',id:asset.id,patch:{rating:5,folderId:'inbox',notes:'note'}});asset=(await msg({type:'state'})).assets.find(a=>a.id===asset.id);assert.equal(asset.rating,5);assert.equal(asset.folderId,'inbox');await msg({type:'folder.delete',id});assert(!(await msg({type:'state'})).folders.some(f=>f.id===id));assert((await msg({type:'asset.update',id:asset.id,patch:{folderId:'missing'}})).error);pass('Asset stars/move persist and folder delete only after contents moved');
const old=await msg({type:'capture.arm',data:{folderId:'inbox',title:'Expired',kind:'image'}});session.arm.expiresAt=Date.now()-1;const next=await msg({type:'capture.arm',data:{folderId:'inbox',title:'Next',kind:'image'}});assert(next.ok);state=await msg({type:'state'});assert.equal(state.assets.find(a=>a.id===old.assetId).status,'failed');pass('Expired arm then new arm does not resurrect old pending record');
assert.equal((await msg({type:'state'})).waitingCaptureId,next.assetId);assert.equal((await msg({type:'capture.cancel',assetId:'other'})).canceled,false);assert.equal((await msg({type:'capture.cancel',assetId:next.assetId})).canceled,true);assert.equal((await msg({type:'state'})).waitingCaptureId,null);assert.equal((await msg({type:'capture.cancel'})).canceled,false);assert.equal((await msg({type:'state'})).assets.find(a=>a.id===next.assetId).status,'failed');pass('Cancel changes only the matching waiting capture, reports whether it canceled and never deletes media');

const interrupted=await msg({type:'capture.arm',data:{folderId:'inbox',title:'Interrupted',kind:'video'}});downloads[88]={...item,id:88,startTime:new Date(Date.now()+10).toISOString()};handlers.filename(downloads[88],()=>{});await tick();downloads[88].state='interrupted';downloads[88].error='NETWORK_FAILED';handlers.changed({id:88,state:{current:'interrupted'}});await tick();assert.equal((await msg({type:'state'})).assets.find(a=>a.id===interrupted.assetId).status,'failed');pass('Interrupted native download never marked downloaded');
const recovering=await msg({type:'capture.arm',data:{folderId:'inbox',title:'Recover',kind:'video'}});downloads[99]={...item,id:99,startTime:new Date(Date.now()+10).toISOString()};handlers.filename(downloads[99],()=>{});await tick();downloads[99].state='complete';downloads[99].filename='/Downloads/AdVault/recovered.mp4';await import('../background.js?restart');await tick();assert.equal((await msg({type:'state'})).assets.find(a=>a.id===recovering.assetId).status,'downloaded');pass('Worker restart reconciles completed pending native download');
const orphan=await msg({type:'capture.arm',data:{folderId:'inbox',title:'Session lost'}});delete session.arm;await import('../background.js?lostsession');await tick();assert.equal((await msg({type:'state'})).assets.find(a=>a.id===orphan.assetId).status,'failed');pass('Browser session loss clears orphan pending state honestly');


const paywall=await msg({type:'capture.arm',data:{folderId:'inbox',title:'Paywall native click emitted no download',kind:'image'}});assert(paywall.ok);session.arm.expiresAt=Date.now()-1;const afterPaywall=await msg({type:'state'});const blocked=afterPaywall.assets.find(a=>a.id===paywall.assetId);assert.equal(blocked.status,'failed');assert.equal(blocked.downloadId,undefined);assert.equal(blocked.filename,undefined);pass('Native paywall/no-download times out as failed without creating a saved-file claim');


const upgrade=await msg({type:'capture.arm',data:{folderId:'inbox',title:'Upgrade permission gate',kind:'image'}});assert(upgrade.ok);assert((await msg({type:'capture.blocked',assetId:upgrade.assetId,reason:'paywall'},{...sender,tab:{id:999}})).error);assert(session.arm);await msg({type:'capture.blocked',assetId:'wrong',reason:'paywall'});assert(session.arm);await msg({type:'capture.blocked',assetId:upgrade.assetId,reason:'paywall'});assert(!session.arm);const upgradeRecord=(await msg({type:'state'})).assets.find(a=>a.id===upgrade.assetId);assert.equal(upgradeRecord.status,'failed');assert(upgradeRecord.error.includes('升级'));assert.equal(upgradeRecord.downloadId,undefined);pass('Paywall signal only matching BigSpy tab+arm fails immediately, never saved');


const genericSender={id:'qa',url:'https://example.test/gallery?private=query',tab:{id:88,url:'https://example.test/gallery'}};let directOptions,canceled=[];let resolveDownload;chrome.downloads.download=options=>{directOptions=options;return new Promise(resolve=>resolveDownload=resolve)};chrome.downloads.cancel=async id=>canceled.push(id);
assert((await msg({type:'capture.direct',data:{url:'https://cdn.test/a.mp4',kind:'video',folderId:'inbox'}})).error);for(const url of ['blob:https://example.test/id','https://user:password@example.test/a.mp4','https://example.test/a.m3u8'])assert((await msg({type:'capture.direct',data:{url,kind:'video',folderId:'inbox'}},genericSender)).error);pass('Direct capture rejects BigSpy fallback, blob, credential URLs and stream manifest');
const directURL='https://cdn.test/actual.mp4?signature=private-token';const direct=await msg({type:'capture.direct',data:{url:directURL,kind:'video',folderId:'inbox'}},genericSender);assert(direct.ok);assert.equal(directOptions.url,directURL);assert(!JSON.stringify(local).includes('private-token'));assert(!JSON.stringify(session).includes('private-token'));assert((await msg({type:'capture.direct',data:{url:directURL,kind:'video',folderId:'inbox'}},genericSender)).error);downloads[201]={id:201,url:directURL,byExtensionId:'qa',mime:'video/mp4',filename:'actual.mp4',state:'in_progress'};let directPath;handlers.filename(downloads[201],v=>directPath=v);await tick();assert(directPath.filename.startsWith('AdVault/'));resolveDownload(201);await tick();downloads[201].state='complete';downloads[201].filename='/Downloads/'+directPath.filename;handlers.changed({id:201,state:{current:'complete'}});await tick();assert.equal((await msg({type:'state'})).assets.find(a=>a.id===direct.assetId).status,'downloaded');pass('Direct download exact asset attribution, folder path, duplicate launch guard, token-free storage and completion');
const rejectURL='https://cdn.test/error.mp4';const reject=await msg({type:'capture.direct',data:{url:rejectURL,kind:'video',folderId:'inbox'}},genericSender);downloads[202]={id:202,url:rejectURL,byExtensionId:'qa',mime:'text/html',filename:'error.mp4',state:'in_progress'};handlers.filename(downloads[202],()=>{});await tick();resolveDownload(202);await tick();assert(canceled.includes(202));assert.equal((await msg({type:'state'})).assets.find(a=>a.id===reject.assetId).status,'failed');pass('Direct HTML/error response canceled and never catalogued as saved media');
chrome.downloads.download=async()=>{throw Error('NETWORK_FAILED https://cdn.test/private.mp4?token=secret-error-token')};const network=await msg({type:'capture.direct',data:{url:'https://cdn.test/rejected.mp4',kind:'video',folderId:'inbox'}},genericSender);await tick();assert.equal((await msg({type:'state'})).assets.find(a=>a.id===network.assetId).status,'failed');assert(!JSON.stringify(local).includes('secret-error-token'));chrome.downloads.download=()=>new Promise(()=>{});const hanging=await msg({type:'capture.direct',data:{url:'https://cdn.test/never-started.mp4',kind:'video',folderId:'inbox'}},genericSender);for(const item of Object.values(session.direct||{}))item.expiresAt=Date.now()-1;assert.equal((await msg({type:'state'})).assets.find(a=>a.id===hanging.assetId).status,'failed');pass('Direct API rejection and startup timeout produce failed state, not false completion');



const rememberedFolder=await msg({type:'folder.create',name:'Last-used choice',parentId:null});const remembered=await msg({type:'capture.arm',data:{folderId:rememberedFolder.id,title:'Remember choice',kind:'image'}});assert(remembered.ok);assert.equal((await msg({type:'state'})).settings.lastFolderId,rememberedFolder.id);await msg({type:'capture.cancel',assetId:remembered.assetId});pass('Accepted capture remembers last folder without automatically starting another capture');
// The launch guard must cover the entire download, not only filename selection.
const inflightURL='https://cdn.test/inflight.mp4?signature=transient-only';
chrome.downloads.download=()=>new Promise(resolve=>resolveDownload=resolve);
const inflight=await msg({type:'capture.direct',data:{url:inflightURL,kind:'video',folderId:'inbox'}},genericSender);
assert(inflight.ok);
downloads[203]={id:203,url:inflightURL,byExtensionId:'qa',mime:'video/mp4',filename:'inflight.mp4',state:'in_progress'};
handlers.filename(downloads[203],()=>{});
await tick();
resolveDownload(203);
await tick();
const beforeDuplicate=(await msg({type:'state'})).assets.length;
assert((await msg({type:'capture.direct',data:{url:inflightURL,kind:'video',folderId:'inbox'}},genericSender)).error,'A second capture while the original download is running must be rejected');
assert.equal((await msg({type:'state'})).assets.length,beforeDuplicate);
for(const request of Object.values(session.direct||{})) if(request.assetId===inflight.assetId) request.expiresAt=Date.now()-1;
await import('../background.js?direct-inflight-restart');
await tick();
assert.equal((await msg({type:'state'})).assets.find(a=>a.id===inflight.assetId).status,'pending');
assert((await msg({type:'capture.direct',data:{url:inflightURL,kind:'video',folderId:'inbox'}},genericSender)).error,'Startup timeout and worker restart must not release an active download');
assert(!JSON.stringify(session).includes('transient-only'));
downloads[203].state='interrupted';
downloads[203].error='NETWORK_FAILED';
handlers.changed({id:203,state:{current:'interrupted'}});
await tick();
assert.equal((await msg({type:'state'})).assets.find(a=>a.id===inflight.assetId).status,'failed');
const retry=await msg({type:'capture.direct',data:{url:inflightURL,kind:'video',folderId:'inbox'}},genericSender);
assert(retry.ok,'An interrupted download must allow an explicit retry');
downloads[204]={...downloads[203],id:204,state:'in_progress'};
delete downloads[204].error;
handlers.filename(downloads[204],()=>{});
await tick();
resolveDownload(204);
await tick();
downloads[204].state='complete';
downloads[204].filename='/Downloads/AdVault/retry.mp4';
handlers.changed({id:204,state:{current:'complete'}});
await tick();
assert.equal((await msg({type:'state'})).assets.find(a=>a.id===retry.assetId).status,'downloaded');
assert(!Object.values(session.direct||{}).some(request=>request.assetId===retry.assetId));
assert(!JSON.stringify(local).includes('transient-only'));
pass('Direct duplicate blocked throughout active download and worker restart; interruption allows retry and completion releases guard');
// Chrome requires its filename callback to settle before cancelling the item.
const filenameCancelOrder=[];
chrome.downloads.cancel=async id=>{filenameCancelOrder.push('cancel');canceled.push(id);};
chrome.downloads.download=()=>new Promise(resolve=>resolveDownload=resolve);
const invalidOrder=await msg({type:'capture.direct',data:{url:'https://cdn.test/not-media.png',kind:'image',folderId:'inbox'}},genericSender);
downloads[205]={id:205,url:'https://cdn.test/not-media.png',byExtensionId:'qa',mime:'text/html',filename:'not-media.png',state:'in_progress'};
handlers.filename(downloads[205],()=>filenameCancelOrder.push('suggest'));
await tick();
assert.deepEqual(filenameCancelOrder,['suggest','cancel']);
resolveDownload(205);await tick();
assert.equal((await msg({type:'state'})).assets.find(a=>a.id===invalidOrder.assetId).status,'failed');
pass('Invalid response settles filename before cancellation, avoiding an unchecked Chrome lastError');
const foldersBeforeClear=structuredClone((await msg({type:'state'})).folders);
const clearPending=await msg({type:'capture.arm',data:{folderId:'inbox',title:'QA pending clear guard',kind:'image'}});
assert((await msg({type:'library.clear'})).error);
assert((await msg({type:'state'})).assets.some(a=>a.id===clearPending.assetId));
await msg({type:'capture.cancel',assetId:clearPending.assetId});
assert((await msg({type:'library.clear'})).ok);
const clearedState=await msg({type:'state'});
assert.deepEqual(clearedState.assets,[]);
assert.deepEqual(clearedState.folders,foldersBeforeClear);
pass('Clear index rejects pending capture and, after cancellation, removes only asset metadata while preserving folders');
const embeddedSender={id:'qa',frameId:4,url:'https://adstransparency.google.com/adframe',tab:{id:88,url:'https://adstransparency.google.com/advertiser/AR1/creative/CR1?region=US'}};
const embeddedData={url:'https://cdn.test/embedded.jpg',kind:'image',folderId:'inbox'};
assert((await msg({type:'capture.direct',data:embeddedData},{...embeddedSender,tab:{id:8,url:'https://bigspy.com/ad/42'}})).error,'A frame must not bypass the BigSpy top-page restriction');
chrome.downloads.download=async()=>{throw Error('QA no network');};
const embedded=await msg({type:'capture.direct',data:embeddedData},embeddedSender);assert(embedded.ok);await tick();
assert.equal((await msg({type:'state'})).assets.find(a=>a.id===embedded.assetId).sourcePage,'https://adstransparency.google.com/advertiser/AR1/creative/CR1');
pass('Embedded capture keeps the top creative page as source and cannot bypass BigSpy restrictions');
const research={provider:'BigSpy',adId:'a03dc91deb7a75e33dbd06d6016d971d',appType:2,searchFlag:145459,runningDays:80,impressions:'1.2M',adText:'完整广告文案\n第二行',token:'secret'};
const researchSender={id:'qa',url:'https://app.bigspy.com/en/adspy/ad-library?token=secret',tab:{id:42,url:'https://app.bigspy.com/en/adspy/ad-library'}};
const formatted=await msg({type:'research.format',data:research},researchSender);assert(formatted.text.includes('投放天数：80'));assert(!formatted.text.includes('secret'));
assert((await msg({type:'research.format',data:research},{id:'qa',url:'https://other.test'})).error);
const native=await msg({type:'capture.arm',data:{folderId:'inbox',kind:'image',title:'BigSpy image',research}},researchSender);assert(native.ok);
const stored=(await msg({type:'state'})).assets.find(a=>a.id===native.assetId);assert.equal(stored.research.runningDays,80);assert.equal(stored.research.adText,research.adText);assert(!('token' in stored.research));assert.equal(stored.sourcePage,'https://app.bigspy.com/adspy/creative/'+research.adId+'?app_type=2&search_flag=145459');
await msg({type:'asset.update',id:native.assetId,patch:{title:'Edited title',rating:4}});assert.deepEqual((await msg({type:'state'})).assets.find(a=>a.id===native.assetId).research,stored.research);
await msg({type:'capture.cancel',assetId:native.assetId});
pass('BigSpy research formats and persists bounded metadata with a canonical creative link and survives title/rating edits');
const quota=await msg({type:'capture.arm',data:{folderId:'inbox',kind:'image'}},researchSender);
await msg({type:'capture.blocked',assetId:'stale',reason:'official-count-limit'},researchSender);assert.equal((await msg({type:'state'})).waitingCaptureId,quota.assetId);
assert((await msg({type:'capture.blocked',assetId:quota.assetId,reason:'official-count-limit'},{...researchSender,tab:{id:999}})).error);
await msg({type:'capture.blocked',assetId:quota.assetId,reason:'official-count-limit'},researchSender);
const denied=(await msg({type:'state'})).assets.find(a=>a.id===quota.assetId);assert.equal(denied.status,'failed');assert.equal(denied.errorCode,'official-count-limit');assert.equal(denied.downloadId,undefined);assert.equal((await msg({type:'state'})).waitingCaptureId,null);
pass('Quota denial fails only the matching capture from its original tab and clears the wait without a file');
console.log('TOTAL',report.length);
