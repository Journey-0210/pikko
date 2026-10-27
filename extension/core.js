import { researchText } from './research.js';
export const MAX_DEPTH=6;
const MIME={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-m4v':'m4v'};
const EXT=new Set(Object.values(MIME).concat('jpeg'));
export function segment(value,fallback='未命名'){let s=String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').trim().replace(/[. ]+$/g,'');if(!s||/^\.+$/.test(s))s=fallback;if(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s))s='_'+s;return s;}
export function safePage(value){
  try {
    const u=new URL(value);if(!/^https?:$/.test(u.protocol))return '';
    const query=new URLSearchParams(),h=u.hostname.toLowerCase();
    // Keep only public content identifiers, never arbitrary tracking/auth parameters.
    let keys=[];
    if(h==='facebook.com'||h.endsWith('.facebook.com'))keys=['id','story_fbid','fbid','v'];
    else if(h==='bigspy.com'||h.endsWith('.bigspy.com'))keys=['id','ad_id','adId',...(/\/adspy\/creative\/[a-f0-9]+\/?$/i.test(u.pathname)?['app_type','search_flag']:[])];
    else if(h==='youtube.com'||h.endsWith('.youtube.com'))keys=['v'];
    for(const key of keys){const values=u.searchParams.getAll(key);if(values.length!==1)continue;const value=values[0];const valid=h==='youtube.com'||h.endsWith('.youtube.com')?/^[\w-]{11}$/.test(value):/^\d{1,40}$/.test(value);if(valid)query.set(key,value);}
    return u.origin+u.pathname+(query.size?'?'+query:'');
  }catch{return '';}
}
export function sourceNote(asset){
  const source=safePage(asset.sourcePage);
  if(!source)throw Error('这条记录没有来源链接，无法自动还原。');
  return '\uFEFFpikko. 来源说明\r\n\r\n'+[
    '文件：'+String(asset.relativePath||asset.filename||'未记录'),
    '标题：'+String(asset.title||'未命名素材'),
    '收藏时间：'+String(asset.createdAt||'未记录'),
    '采集页面：'+source,
    ...(asset.research ? ['', researchText(asset.research, source)] : []),
    '',
    asset.sourceLinkVersion?'已保留受支持的内容 ID；若从列表页采集，此链接可能返回列表。':'旧记录可能缺少原网址参数，无法自动还原已丢失的内容 ID。',
    '这是采集时的来源记录。页面删除、登录或访问权限变化可能影响打开。'
  ].join('\r\n')+'\r\n';
}
export function host(value){try{return new URL(value).hostname.toLowerCase();}catch{return '';}}
export function bigSpy(value){const h=host(value);return h==='bigspy.com'||h.endsWith('.bigspy.com');}
export function mediaType(item){const mime=String(item.mime||'').toLowerCase().split(';')[0].trim();if(mime&&mime!=='application/octet-stream'&&!MIME[mime])return null;let ext=String(item.filename||'').split(/[\\/]/).pop().split('.').pop().toLowerCase();if(!EXT.has(ext))ext=MIME[mime];if(!ext)return null;const kind=['mp4','webm','mov','m4v'].includes(ext)?'video':'image';if(mime&&MIME[mime]&&!mime.startsWith(kind+'/'))return null;return {ext,kind};}
export function bigSpyBlob(item,arm){if(!arm||!bigSpy('https://'+arm.hostname)||!/^[a-f0-9]{32}$/i.test(arm.adId||'')||!String(item.url||'').startsWith('blob:')||host(item.url.slice(5))!==arm.hostname)return false;const name=String(item.filename||'').split(/[\\/]/).pop();return !name||new RegExp('(?:^|[^a-f0-9])'+arm.adId+'(?:[^a-f0-9]|$)','i').test(name);}
export function eligibilityReason(item,arm,now=Date.now()){
 if(!arm)return 'no-active-capture';if(now>=arm.expiresAt)return 'capture-expired';
 const untyped=bigSpyBlob(item,arm)&&/^(?:text\/plain|application\/octet-stream)?$/i.test(item.mime||'');const type=mediaType(item)||(untyped?{kind:arm.kind}:null);
 if(!type)return 'unsupported-mime-or-filename';if(type.kind!==arm.kind)return 'media-kind-mismatch';if(item.byExtensionId)return 'extension-download';
 const start=Date.parse(item.startTime);if(!Number.isFinite(start)||start<arm.armedAt)return 'download-before-capture';
 if(item.referrer)return host(item.referrer)===arm.hostname?'':'referrer-mismatch';
 return bigSpyBlob(item,arm)||arm.allowMissingReferrer===true?'':'missing-provenance';
}
export function eligible(item,arm,now=Date.now()){return eligibilityReason(item,arm,now)==='';}
export function folderChain(folders,id){const result=[];const seen=new Set();while(id){if(seen.has(id))throw Error('文件夹结构存在循环');seen.add(id);const f=folders.find(x=>x.id===id);if(!f)throw Error('文件夹不存在');result.unshift(f);id=f.parentId;if(result.length>MAX_DEPTH)throw Error('最多支持六级文件夹');}return result;}
export function folderName(name){name=String(name||'').trim();if(!name||name.length>100)throw Error('文件夹名称须为 1–100 个字符');return name;}
export function createFolder(folders,{name,parentId},id){name=folderName(name);parentId=parentId||null;if(parentId&&folderChain(folders,parentId).length>=MAX_DEPTH)throw Error('最多支持六级文件夹');if(folders.some(f=>f.parentId===parentId&&f.name===name))throw Error('同级文件夹已存在');return [...folders,{id,name,parentId}];}
export function deleteFolder(folders,assets,id){if(!folders.some(f=>f.id===id))throw Error('文件夹不存在');if(folders.some(f=>f.parentId===id)||assets.some(a=>a.folderId===id))throw Error('请先移动或移除文件夹内的素材与子文件夹');return folders.filter(f=>f.id!==id);}
export function metadata(data){return {title:String(data.title||'未命名素材').slice(0,250),notes:String(data.notes||'').slice(0,4000),tags:[...new Set((Array.isArray(data.tags)?data.tags:[]).map(x=>String(x).trim().slice(0,40)).filter(Boolean))].slice(0,30),rating:Math.max(0,Math.min(5,Math.round(Number(data.rating)||0))),platform:['Meta','Google'].includes(data.platform)?data.platform:'其他',kind:data.kind==='video'?'video':'image'};}
export function folderDiskSegment(folder){return segment(segment(folder.name).slice(0,12))+'-'+folder.id.replace(/[^a-z0-9]/gi,'').slice(-6);}
export function folderDiskPath(folders,id){return folderChain(folders,id).map(f=>f.diskSegment===segment(f.diskSegment||'')&&f.diskSegment?f.diskSegment:folderDiskSegment(f)).join('/');}
export function downloadPath(item,asset,folders){const type=mediaType(item);if(!type)throw Error('非支持的图片或视频');const dirs=folderDiskPath(folders,asset.folderId);const name=segment(segment(asset.title).slice(0,32),'素材');return `AdVault/${dirs}/${name}-${item.id}.${type.ext}`;}
export function relativeActual(filename){const path=String(filename||'').replace(/\\/g,'/');const normalized=path.startsWith('AdVault/')?'/'+path:path;const at=normalized.lastIndexOf('/AdVault/');if(at<0)return null;const rel=normalized.slice(at+9);const parts=rel.split('/');if(!rel||parts.some(x=>!x||x==='.'||x==='..'||/[\u0000-\u001f<>:"\\|?*]/.test(x)))return null;return rel;}
