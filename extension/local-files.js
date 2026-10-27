import {folderChain,folderDiskSegment,folderDiskPath,relativeActual} from './core.js';

// Resolve these filenames outside the background mutation queue: the download
// must finish before its folder/asset record may commit on that same queue.
const localWrites=new Map();
export function localWriteSuggestion(item){
  const filename=item.byExtensionId===chrome.runtime.id?localWrites.get(item.url):null;
  return filename?{filename,conflictAction:'uniquify'}:null;
}
export async function downloadLocalFile(url,filename,timeout=60000){
  const relative=relativeActual(filename);
  if(!relative)throw Error('本地文件路径无效。');
  localWrites.set(url,filename);
  try{
    const id=await chrome.downloads.download({url,filename,conflictAction:'uniquify',saveAs:false});
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){
      const [file]=await chrome.downloads.search({id});
      if(file?.state==='complete'){
        const actual=relativeActual(file.filename);
        if(file.exists===false||!actual||actual.split('/').slice(0,-1).join('/')!==relative.split('/').slice(0,-1).join('/'))throw Error('文件未保存到所选本地目录，请检查浏览器下载设置后重试。');
        return {id,filename:file.filename,relativePath:actual,size:file.fileSize};
      }
      if(file?.state==='interrupted')throw Error('本地保存未完成：'+(file.error||'浏览器已取消下载'));
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('本地保存尚未确认完成，请检查浏览器下载记录后再重试。');
  }finally{localWrites.delete(url);}
}
export async function materializeFolder(folders,id){
  const chain=folderChain(folders,id);
  for(const folder of chain)folder.diskSegment ||= folderDiskSegment(folder);
  const directory=folderDiskPath(folders,id);
  const info={application:'pikko.',schema:1,folderId:id,folders:chain.map(({id,name,parentId,diskSegment})=>({id,name,parentId,diskSegment})),createdAt:new Date().toISOString()};
  const file=await downloadLocalFile('data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(info,null,2)),`AdVault/${directory}/pikko-folder.json`,15000);
  const folder=chain.at(-1);folder.localPath=directory;folder.localCreatedAt=new Date().toISOString();
  return file;
}
