import test from 'node:test';import assert from 'node:assert/strict';
import {downloadLocalFile,materializeFolder,localWriteSuggestion} from '../local-files.js';
import {folderDiskPath,downloadPath} from '../core.js';

test('local folder commits after actual completed download, validates location and preserves stable disk names',async()=>{
  let mode='complete',last;
  globalThis.chrome={runtime:{id:'local-test'},downloads:{async download(options){last=options;assert.deepEqual(localWriteSuggestion({url:options.url,byExtensionId:'local-test'}),{filename:options.filename,conflictAction:'uniquify'});assert.equal(localWriteSuggestion({url:options.url,byExtensionId:'other'}),null);return 1;},async search(){return [{id:1,state:mode,filename:mode==='wrong'?'/Downloads/elsewhere/file.json':'/Downloads/'+last.filename,exists:true,error:'USER_CANCELED'}];}}};
  const folders=[{id:'folderabc',name:'Meta',parentId:null}];await materializeFolder(folders,'folderabc');assert.equal(folders[0].localPath,'Meta-derabc');const manifest=JSON.parse(decodeURIComponent(last.url.split(',').slice(1).join(',')));assert.equal(manifest.folderId,'folderabc');assert.equal(localWriteSuggestion({url:last.url,byExtensionId:'local-test'}),null);
  folders[0].name='改名';assert.equal(folderDiskPath(folders,'folderabc'),'Meta-derabc');assert(downloadPath({id:9,mime:'image/png',filename:'a.png'},{folderId:'folderabc',title:'test'},folders).startsWith('AdVault/Meta-derabc/'));
  mode='interrupted';await assert.rejects(downloadLocalFile('data:failure','AdVault/test/file.json'),/USER_CANCELED/);mode='wrong';chrome.downloads.search=async()=>[{state:'complete',filename:'/Downloads/elsewhere/file.json'}];await assert.rejects(downloadLocalFile('data:wrong','AdVault/test/file.json'),/所选本地目录/);
  await assert.rejects(downloadLocalFile('data:path','../file.json'),/路径/);
});
