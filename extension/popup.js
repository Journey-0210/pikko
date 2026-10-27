import {folderChain} from './core.js';
import {syncCaptureTabs} from './capture-control.js';
const $=id=>document.getElementById(id);
function status(message,error=false){$('status').textContent=message;$('status').hidden=false;$('status').classList.toggle('error',error);}
async function message(data){const result=await chrome.runtime.sendMessage(data);if(!result||result.error)throw Error(result?.error||'扩展没有响应，请刷新后重试。');return result;}
async function refresh(selected){
  const data=await message({type:'state'}),state=data.state||data;
  const parent=$('parent-folder'),previous=selected??parent.value;parent.replaceChildren(new Option('资料库顶层',''));
  const labels=state.folders.map(folder=>{let label;try{label=folderChain(state.folders,folder.id).map(f=>f.name).join(' / ');}catch{label=folder.name;}return {id:folder.id,label};});
  labels.sort((a,b)=>b.label.localeCompare(a.label,'zh-CN',{numeric:true}));
  for(const folder of labels)parent.append(new Option(folder.label,folder.id));parent.value=labels.some(f=>f.id===previous)?previous:'';
  $('cancel').hidden=!state.waitingCaptureId;
  document.querySelector('.more-menu').hidden=!state.waitingCaptureId;
}
$('new-folder').onclick=()=>{const form=$('create-form');form.hidden=!form.hidden;$('new-folder').setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)$('folder-name').focus();};
$('library').onclick=async()=>{try{await chrome.runtime.openOptionsPage();}catch(error){status(error.message,true);}};
$('cancel').onclick=async()=>{try{const result=await message({type:'capture.cancel'});status(result.canceled?'已取消等待':'当前没有等待接收的下载');await refresh();}catch(error){status(error.message,true);}};
const captureSwitch=$('capture-enabled');
async function syncCapture(enabled){const results=await syncCaptureTabs(enabled);if(results.some(result=>!result.ok&&result.active))status('此网页需要刷新一次才能同步开关',true);}
chrome.storage.local.get('captureEnabled').then(async data=>{captureSwitch.checked=data.captureEnabled!==false;await syncCapture(captureSwitch.checked);captureSwitch.disabled=false;}).catch(error=>status(error.message,true));
captureSwitch.onchange=async()=>{const enabled=captureSwitch.checked;captureSwitch.disabled=true;try{await chrome.storage.local.set({captureEnabled:enabled});}catch(error){captureSwitch.checked=!enabled;status(error.message,true);captureSwitch.disabled=false;return;}try{await syncCapture(enabled);}catch{status('此网页需要刷新一次才能同步开关',true);}finally{captureSwitch.disabled=false;}};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.captureEnabled)captureSwitch.checked=changes.captureEnabled.newValue!==false;});
$('create-form').addEventListener('submit',async event=>{
  event.preventDefault();const name=$('folder-name').value.trim();if(!name||$('create-folder').disabled)return;
  const button=$('create-folder');button.disabled=true;button.textContent='创建中';
  try{const result=await message({type:'folder.create',name,parentId:$('parent-folder').value||null});
    if(!result.localCreated)throw Error('尚未确认本地文件夹创建成功，请到资料库检查。');
    $('folder-name').value='';status(`已创建「${name}」`);$('status').title=result.localPath;await refresh(result.id);
  }catch(error){status(error.message,true);}finally{button.disabled=false;button.textContent='创建';}
});
refresh().catch(error=>status(error.message,true));
