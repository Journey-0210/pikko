import {bigSpy,bigSpyBlob,host,safePage,sourceNote,eligible,folderChain,createFolder,deleteFolder,folderName,metadata,downloadPath,relativeActual,mediaType} from './core.js';
import {loadDirectoryHandle,readAssetOriginal,inspectDownloadedOriginal} from './vault-db.js';
import {materializeFolder,downloadLocalFile,localWriteSuggestion} from './local-files.js';
import {normalizeResearch,researchText,researchSource} from './research.js';
import {observeDownloadResponse} from './download-response.js';
import {eligibilityReason} from './core.js';
async function trace(event,data={}){const {captureEvents=[]}=await chrome.storage.session.get('captureEvents');captureEvents.push({sequence:(captureEvents.at(-1)?.sequence||0)+1,event,at:new Date().toISOString(),...data});await chrome.storage.session.set({captureEvents:captureEvents.slice(-1500)});}
let queue=Promise.resolve();
function serial(fn){const result=queue.then(fn);queue=result.catch(console.error);return result;}
async function keyFor(url){const bytes=new TextEncoder().encode(url);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const fresh=()=>({schema:2,folders:[{id:'inbox',parentId:null,name:'待整理'}],assets:[],settings:{}});
async function state(){const data=await chrome.storage.local.get('vault');if(data.vault)return data.vault;const vault=fresh();await chrome.storage.local.set({vault});return vault;}
async function save(vault){await chrome.storage.local.set({vault});}
async function notify(asset,status,error){if(asset.tabId!=null)try{await chrome.tabs.sendMessage(asset.tabId,{type:'capture.status',assetId:asset.id,status,error});}catch{}}
async function verifyNativeOriginal(asset,download){
  const directory=await loadDirectoryHandle(),original=await readAssetOriginal(asset,directory),checked=await inspectDownloadedOriginal(original);
  if(checked.kind!==asset.kind)throw Error('原文件与所选素材类型不符');
  const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'}[checked.mime];
  if(!asset.relativePath.toLowerCase().endsWith('.'+extension)){
    const bytes=new Uint8Array(await original.arrayBuffer());let binary='';
    for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));
    const url=`data:${checked.mime};base64,${btoa(binary)}`;
    const destination='AdVault/'+asset.relativePath.replace(/\.[^/.]+$/,'.'+extension);
    const saved=await downloadLocalFile(url,destination);
    const copy=await readAssetOriginal({relativePath:saved.relativePath},directory);
    const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).join(',');
    if(copy.size!==original.size||await digest(copy)!==await digest(original))throw Error('原文件写入后校验不一致');
    Object.assign(asset,{nativeDownloadId:download.id,downloadId:saved.id,filename:saved.filename,relativePath:saved.relativePath,requestedPath:destination});
    await chrome.downloads.removeFile(download.id).catch(()=>{});
  }
  return checked;
}
// Sidecar downloads have their own state and never change media success/failure.
async function startSourceNote(s,a){
  if(a.status!=='downloaded'||!a.relativePath||relativeActual('AdVault/'+a.relativePath)!==a.relativePath)throw Error('请先完成原文件下载；未记录硬盘位置时不能保存同目录来源说明。');
  if(a.sourceNote?.status==='pending')throw Error('来源说明正在保存，请稍后再试。');
  const text=sourceNote(a),filename='AdVault/'+a.relativePath+'.source.txt',url='data:text/plain;charset=utf-8,'+encodeURIComponent(text);
  a.sourceNote={status:'pending',startedAt:new Date().toISOString(),requestedPath:filename,key:await keyFor(url)};await save(s);
  // Filename callbacks run on the same queue, so initiation must not block it.
  Promise.resolve().then(()=>chrome.downloads.download({url,filename,conflictAction:'uniquify',saveAs:false}))
    .then(id=>serial(async()=>{const latest=await state(),found=latest.assets.find(x=>x.id===a.id);if(!found)return;found.sourceNote.downloadId=id;await save(latest);await reconcileSourceNote(id);}))
    .catch(()=>serial(async()=>{const latest=await state(),found=latest.assets.find(x=>x.id===a.id);if(found){found.sourceNote={status:'failed',error:'来源说明未能保存。原素材不受影响，可在详情中重试。'};await save(latest);}}));
}
async function reconcileSourceNote(id){
  const s=await state(),a=s.assets.find(x=>x.sourceNote?.downloadId===Number(id)&&x.sourceNote.status==='pending');if(!a)return;
  const [d]=await chrome.downloads.search({id:Number(id)});if(d?.state==='in_progress')return;
  const relative=relativeActual(d?.filename),sameDirectory=relative&&relative.split('/').slice(0,-1).join('/')===a.relativePath.split('/').slice(0,-1).join('/');
  a.sourceNote.status=d?.state==='complete'&&sameDirectory?'downloaded':'failed';
  if(a.sourceNote.status==='downloaded')a.sourceNote.relativePath=relative;
  else a.sourceNote.error='来源说明未保存完成。原素材不受影响，可在详情中重试。';
  await save(s);
}
async function currentArm(){const {arm}=await chrome.storage.session.get('arm');if(arm&&Date.now()>=arm.expiresAt){await chrome.storage.session.remove('arm');const s=await state();const a=s.assets.find(a=>a.id===arm.assetId);if(a&&a.status==='pending'){a.status='failed';a.error='等待官方下载超时，未保存原文件。请重新尝试或导入文件。';await save(s);await notify(a,'failed',a.error);}return null;}return arm;}
async function expireDirect(){const {direct={}}=await chrome.storage.session.get('direct');const expired=Object.entries(direct).filter(([,d])=>d.downloadId==null&&Date.now()>=d.expiresAt);if(!expired.length)return;const s=await state();for(const [key,d] of expired){delete direct[key];const a=s.assets.find(a=>a.id===d.assetId);if(a?.status==='pending'&&a.downloadId==null){a.status='failed';a.error='媒体下载启动超时，未确认保存原文件';await notify(a,'failed',a.error);}}await chrome.storage.session.set({direct});await save(s);}
function findAsset(s,id){const asset=s.assets.find(x=>x.id===id);if(!asset)throw Error('素材不存在');return asset;}
async function message(m,sender){if(m.type==='capture.trace')return {events:(await chrome.storage.session.get('captureEvents')).captureEvents||[]};if(m.type==='state'){const arm=await currentArm();await expireDirect();return {...await state(),waitingCaptureId:arm?.assetId||null};}
if(m.type==='research.format'){if(!bigSpy(sender.url||sender.tab?.url))throw Error('请从 BigSpy 广告详情复制数据');const data=normalizeResearch(m.data);if(!data)throw Error('未识别这条广告的数据');return {text:researchText(data,researchSource(data,sender.url||sender.tab.url))};}
let s=await state();
if(m.type==='folder.create'||m.type==='folder.materialize'){
const id=m.type==='folder.create'?crypto.randomUUID():m.id;
const folders=m.type==='folder.create'?createFolder(s.folders,m,id):structuredClone(s.folders);
const file=await materializeFolder(folders,id);s.folders=folders;s.settings ||= {};s.settings.localRoot=file.filename.replaceAll('\\','/').split('/AdVault/')[0]+'/AdVault';await save(s);
return {ok:true,id,folder:s.folders.find(f=>f.id===id),localPath:file.filename,localCreated:true};}
if(m.type==='folder.rename'){const f=s.folders.find(f=>f.id===m.id);if(!f)throw Error('文件夹不存在');const name=folderName(m.name);if(s.folders.some(x=>x.id!==f.id&&x.parentId===f.parentId&&x.name===name))throw Error('同级文件夹已存在');f.name=name;await save(s);return {ok:true};}
if(m.type==='folder.delete'){s.folders=deleteFolder(s.folders,s.assets,m.id);await save(s);return {ok:true};}
if(m.type==='asset.update'){const a=findAsset(s,m.id),p=m.patch||{};if(p.folderId!==undefined){folderChain(s.folders,p.folderId);if(!p.folderId)throw Error('请选择文件夹');a.folderId=p.folderId;}if('sourcePage' in p){const source=safePage(p.sourcePage);if(!source)throw Error('来源链接无效');a.sourcePage=source;a.sourceLinkVersion=1;}const clean=metadata({...a,...p});for(const key of ['title','notes','tags','rating','platform'])if(key in p)a[key]=clean[key];a.updatedAt=new Date().toISOString();await save(s);return {ok:true};}
if(m.type==='asset.delete'){const a=findAsset(s,m.id);if(a.status==='pending')throw Error('请等待下载完成或取消接收后再移除');s.assets=s.assets.filter(x=>x.id!==m.id);await save(s);return {ok:true};}
if(m.type==='library.clear'){if(s.assets.some(a=>a.status==='pending'))throw Error('请先取消接收并等待正在下载的项目结束');s.assets=[];await save(s);return {ok:true};}
if(m.type==='asset.import'){
const input=m.asset||{};folderChain(s.folders,input.folderId);if(!input.folderId||!input.blobId)throw Error('导入数据不完整');
const a={id:crypto.randomUUID(),...metadata(input),folderId:input.folderId,blobId:String(input.blobId),mime:String(input.mime||''),size:Number(input.size)||0,status:'imported',createdAt:new Date().toISOString()};
if(input.sourcePage){const source=safePage(input.sourcePage);if(!source)throw Error('来源链接无效');a.sourcePage=source;a.sourceLinkVersion=1;}
if(input.localURL){
  const origin=`chrome-extension://${chrome.runtime.id}`;
  if(!String(sender.url||'').startsWith(origin+'/')||!String(input.localURL).startsWith('blob:'+origin+'/'))throw Error('请从扩展资料库导入原文件。');
  const filename=downloadPath({id:a.id,mime:a.mime,filename:String(input.filename||'')},a,s.folders);
  const file=await downloadLocalFile(input.localURL,filename);delete a.blobId;Object.assign(a,{filename:file.filename,relativePath:file.relativePath,downloadId:file.id,size:file.size||a.size});
}
s.assets.unshift(a);await save(s);return {ok:true,id:a.id,asset:a};}
if(m.type==='asset.source-note'){await startSourceNote(s,findAsset(s,m.id));return {ok:true};}
if(m.type==='asset.reveal'){const a=findAsset(s,m.id);if(a.downloadId==null)throw Error('导入文件保存在浏览器本地资料库，没有系统下载路径');const [d]=await chrome.downloads.search({id:a.downloadId});if(!d||d.exists===false)throw Error('文件或下载记录不存在，请在本地目录查找');await chrome.downloads.show(a.downloadId);return {ok:true};}
if(m.type==='capture.direct'){
if(!sender.tab||!/^https?:/.test(sender.url||sender.tab.url||''))throw Error('请从已启用采集的网页操作');
if(bigSpy(sender.url||sender.tab.url)||bigSpy(sender.tab.url))throw Error('BigSpy 必须使用官方授权下载，不能使用通用采集绕过权限');
const data=m.data||{};let url;try{url=new URL(data.url);}catch{throw Error('没有可下载的直接媒体地址');}
if(!['https:','http:'].includes(url.protocol)||url.username||url.password||/\.(m3u8|mpd)(?:$|[?#])/i.test(url.href))throw Error('不支持此媒体地址或流媒体格式');
folderChain(s.folders,data.folderId);if(!data.folderId)throw Error('请选择文件夹');
const key=await keyFor(url.href);const {direct={}}=await chrome.storage.session.get('direct');
if(direct[key]&&(direct[key].downloadId!=null||direct[key].expiresAt>Date.now()))throw Error('此素材正在下载，请勿重复点击');
const asset={id:crypto.randomUUID(),...metadata(data),folderId:data.folderId,sourcePage:safePage(sender.frameId?sender.tab.url:sender.url||sender.tab.url),sourceLinkVersion:1,status:'pending',tabId:sender.tab.id,createdAt:new Date().toISOString()};
s.assets.unshift(asset);s.settings ||= {};s.settings.lastFolderId=asset.folderId;await save(s);direct[key]={assetId:asset.id,armedAt:Date.now(),expiresAt:Date.now()+120000};await chrome.storage.session.set({direct});
// Do not await download initiation inside the serial queue: filename resolution is another queued event.
chrome.downloads.download({url:url.href,conflictAction:'uniquify'}).then(id=>serial(async()=>{const latest=await state();const a=latest.assets.find(a=>a.id===asset.id);if(a){a.downloadId=id;await save(latest);await reconcile(id);}})).catch(error=>serial(async()=>{const latest=await state();const a=latest.assets.find(a=>a.id===asset.id);if(a&&a.status==='pending'){a.status='failed';a.error='媒体下载未启动。资源可能不可访问、请求被拒绝或浏览器取消了下载；请检查页面后重试。';await save(latest);await notify(a,'failed',a.error);}const stored=await chrome.storage.session.get('direct');if(stored.direct?.[key]?.assetId===asset.id){delete stored.direct[key];await chrome.storage.session.set({direct:stored.direct});}}));
return {ok:true,assetId:asset.id};}
if(m.type==='capture.arm'){
if(!sender.tab||!bigSpy(sender.url||sender.tab.url))throw Error('只能从 BigSpy 页面发起素材采集');
if(await currentArm())throw Error('上一份素材仍在等待官方下载，请先完成或取消接收');
s=await state();
const data=m.data||{};folderChain(s.folders,data.folderId);if(!data.folderId)throw Error('请选择文件夹');const id=crypto.randomUUID();const now=Date.now();
const asset={id,...metadata(data),folderId:data.folderId,sourcePage:safePage(sender.url||sender.tab.url),sourceLinkVersion:1,status:'pending',tabId:sender.tab.id,createdAt:new Date().toISOString()};
const research=normalizeResearch(data.research);if(research){asset.research=research;asset.sourcePage=researchSource(research,sender.url||sender.tab.url);}
const arm={assetId:id,hostname:host(sender.url||sender.tab.url),kind:asset.kind,armedAt:now,expiresAt:now+120000,allowMissingReferrer:data.allowMissingReferrer===true,...(research?{adId:research.adId}:{})};
s.assets.unshift(asset);s.settings ||= {};s.settings.lastFolderId=asset.folderId;await save(s);await chrome.storage.session.set({arm});await trace('capture.arm',{assetId:id,adId:arm.adId,kind:arm.kind});
try{await chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[sender.frameId||0]},world:'MAIN',func:observeDownloadResponse,args:[id]});}
catch{await chrome.storage.session.remove('arm');asset.status='failed';asset.error='官方下载响应监听未能启动，请刷新页面后重试';await save(s);throw Error(asset.error);}
return {ok:true,assetId:id};}
if(m.type==='capture.response'){const {arm}=await chrome.storage.session.get('arm');if(arm?.assetId===m.assetId&&sender.tab?.id===s.assets.find(a=>a.id===arm.assetId)?.tabId&&bigSpy(sender.url||sender.tab?.url)&&m.status===200)await trace('official.response',{assetId:arm.assetId,adId:arm.adId,status:200,responseAt:m.responseAt});return {ok:true};}
if(m.type==='capture.blocked'){const {arm}=await chrome.storage.session.get('arm');if(!['paywall','official-count-limit','official-denied'].includes(m.reason)||!arm||arm.assetId!==m.assetId)return {ok:true};const a=findAsset(s,m.assetId);if(sender.tab?.id!==a.tabId||!bigSpy(sender.url||sender.tab?.url))throw Error('来源不匹配');await chrome.storage.session.remove('arm');a.status='failed';a.errorCode=m.reason;await trace('official.response',{assetId:a.id,adId:a.research?.adId,status:403,reason:m.reason,responseAt:m.responseAt});a.error=m.reason==='official-count-limit'?'BigSpy 本次官方下载请求被次数限制拒绝（COUNT EXHAUSTED / HTTP 403），未产生文件。限制的计数范围与恢复时间未确认，不能据此判断账号总额度用完。':m.reason==='official-denied'?'BigSpy 官方下载接口拒绝请求（HTTP 403），未产生文件；请检查账号下载权限。':'BigSpy 提示需要升级套餐，官方下载被阻止。没有保存预览或绕过下载权限；请使用具有官方下载权限的账户。';await save(s);await notify(a,'failed',a.error);return {ok:true};}
if(m.type==='capture.cancel'){const {arm}=await chrome.storage.session.get('arm');const canceled=Boolean(arm&&(!m.assetId||m.assetId===arm.assetId));if(canceled){await chrome.storage.session.remove('arm');const a=s.assets.find(x=>x.id===arm.assetId);if(a){a.status='failed';a.error='已取消接收，未保存原文件';await save(s);await notify(a,'failed',a.error);}}return {ok:true,canceled};}
if(m.type==='library.open'){await chrome.runtime.openOptionsPage();return {ok:true};}
throw Error('未知操作');}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{if(sender.id!==chrome.runtime.id)return;serial(()=>message(m,sender)).then(respond,e=>respond({error:e.message}));return true;});
chrome.downloads.onDeterminingFilename.addListener((item,suggest)=>{const local=localWriteSuggestion(item);if(local){suggest(local);return;}let done=false;const finish=value=>{if(!done){done=true;suggest(value);}};serial(async()=>{if(item.byExtensionId===chrome.runtime.id&&String(item.url||'').startsWith('data:text/plain')){const key=await keyFor(item.url),s=await state(),a=s.assets.find(x=>x.sourceNote?.status==='pending'&&x.sourceNote.key===key);finish(a?{filename:a.sourceNote.requestedPath,conflictAction:'uniquify'}:undefined);return;}if(item.byExtensionId===chrome.runtime.id){const key=await keyFor(item.url||'');const {direct={}}=await chrome.storage.session.get('direct');const request=direct[key];if(!request){finish();return;}delete direct[key];await chrome.storage.session.set({direct});const s=await state();const a=s.assets.find(a=>a.id===request.assetId);if(!a){finish();return;}const type=mediaType(item);if(Date.now()>=request.expiresAt||!type||type.kind!==a.kind){a.status='failed';a.error='下载响应不是所选类型的可保存图片/视频，已停止。不会将封面、网页或流媒体当作原文件。';a.downloadId=item.id;await save(s);finish();chrome.downloads.cancel(item.id).catch(()=>{});await notify(a,'failed',a.error);return;}a.downloadId=item.id;a.requestedPath=downloadPath(item,a,s.folders);a.downloadStartedAt=new Date().toISOString();await save(s);direct[key]={...request,downloadId:item.id};await chrome.storage.session.set({direct});finish({filename:a.requestedPath,conflictAction:'uniquify'});return;}const arm=await currentArm();const rejection=eligibilityReason(item,arm);await trace('download.match',{id:item.id,assetId:arm?.assetId,adId:arm?.adId,mime:item.mime,filename:String(item.filename||'').split(/[\\/]/).pop(),accepted:!rejection,reason:rejection});if(rejection){finish();return;}const s=await state();const a=s.assets.find(a=>a.id===arm.assetId);if(!a){finish();return;}const untyped=bigSpyBlob(item,arm)&&!mediaType(item);const received=untyped?{...item,mime:a.kind==='video'?'video/mp4':'image/png',filename:a.kind==='video'?'original.mp4':'original.png'}:item;if(untyped)a.verifyOriginal=true;const filename=downloadPath(received,a,s.folders);a.downloadId=item.id;a.requestedPath=filename;a.downloadStartedAt=new Date().toISOString();await save(s);await chrome.storage.session.remove('arm');finish({filename,conflictAction:'uniquify'});}).catch(()=>finish());return true;});
async function reconcile(id){await reconcileSourceNote(id);const s=await state();const a=s.assets.find(a=>a.downloadId===Number(id)&&a.status==='pending');if(!a)return;const [d]=await chrome.downloads.search({id:Number(id)});if(d?.state==='in_progress')return;if(d?.state==='complete'){
  a.filename=d.filename;a.relativePath=relativeActual(d.filename);a.completedAt=d.endTime||new Date().toISOString();a.size=d.fileSize;
  try{
    let checked;
    if(a.verifyOriginal)checked=await verifyNativeOriginal(a,d);
    a.status='downloaded';a.mime=checked?.mime||d.mime;a.kind=checked?.kind||mediaType(d)?.kind||a.kind;delete a.error;delete a.verifyOriginal;
  }catch(error){a.status='failed';a.error='原文件已下载，但内容核验未通过：'+error.message;}
}else{a.status='failed';a.error=d?.error||'下载记录已移除，未确认保存成功';}const {direct={}}=await chrome.storage.session.get('direct');for(const [key,request] of Object.entries(direct))if(request.assetId===a.id)delete direct[key];await chrome.storage.session.set({direct});await save(s);await notify(a,a.status,a.error);if(a.status==='downloaded'&&a.sourcePage&&a.relativePath&&!a.sourceNote)await startSourceNote(s,a);}
chrome.downloads.onCreated.addListener(d=>serial(async()=>{const {arm}=await chrome.storage.session.get('arm');if(arm)await trace('download.created',{id:d.id,assetId:arm.assetId,adId:arm.adId,mime:d.mime,state:d.state,scheme:String(d.url||'').split(':')[0]});}));
chrome.downloads.onChanged.addListener(d=>{if(d.state||d.error)serial(async()=>{await trace('download.changed',{id:d.id,state:d.state?.current,error:d.error?.current});await reconcile(d.id);});});
chrome.downloads.onErased.addListener(id=>serial(()=>reconcile(id)));
serial(async()=>{const s=await state();for(const a of s.assets.filter(x=>x.sourceNote?.status==='pending')){if(a.sourceNote.downloadId!=null)await reconcileSourceNote(a.sourceNote.downloadId);else{const latest=await state(),found=latest.assets.find(x=>x.id===a.id);if(found){found.sourceNote={status:'failed',error:'来源说明保存状态未确认，请在详情中重试。'};await save(latest);}}}});

serial(async()=>{await currentArm();await expireDirect();const s=await state();const {arm,direct={}}=await chrome.storage.session.get(['arm','direct']);for(const a of s.assets.filter(x=>x.status==='pending')){if(a.downloadId!=null)await reconcile(a.downloadId);else if((!arm||arm.assetId!==a.id)&&!Object.values(direct).some(d=>d.assetId===a.id&&d.expiresAt>Date.now())){a.status='failed';a.error='浏览器接收会话已结束，请重新采集';}}const latest=await state();for(const a of s.assets.filter(x=>x.status==='failed'&&x.downloadId==null)){const found=latest.assets.find(x=>x.id===a.id);if(found?.status==='pending')Object.assign(found,a);}await save(latest);});

