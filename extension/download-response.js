// Runs in BigSpy's MAIN world. Observe the official request; never initiate one.
export function observeDownloadResponse(assetId) {
  globalThis.__pikkoDownloadResponseStop?.();
  const originalFetch=window.fetch, proto=XMLHttpRequest.prototype;
  const originalOpen=proto.open, originalSend=proto.send, paths=new WeakMap();
  let timer;
  const matches=value=>{try{const u=new URL(value,location.href);return u.origin===location.origin&&u.pathname==='/napi/v1/bs-download/creative';}catch{return false;}};
  function report(status,body){
    if(status===200){window.dispatchEvent(new CustomEvent('pikko-official-download-response',{detail:{assetId,status,responseAt:Date.now()}}));return;}
    if(status!==403)return;
    let data;try{data=typeof body==='string'?JSON.parse(body):body;}catch{return;}
    const code=data?.id==='COUNT EXHAUSTED'?'official-count-limit':'official-denied';
    window.dispatchEvent(new CustomEvent('pikko-official-download-denied',{detail:{assetId,reason:code,responseAt:Date.now()}}));
    stop();
  }
  function fetchObserved(...args){
    const result=Reflect.apply(originalFetch,this,args);
    if(matches(args[0]?.url||args[0]))result.then(r=>{if(r.status===200)report(200,null);if(r.status===403)r.clone().text().then(body=>report(r.status,body)).catch(()=>{});},()=>{});
    return result;
  }
  function openObserved(method,url,...args){paths.set(this,matches(url));return Reflect.apply(originalOpen,this,[method,url,...args]);}
  function sendObserved(...args){
    if(paths.get(this))this.addEventListener('load',()=>{if(this.status===200)report(200,null);if(this.status===403)report(this.status,this.responseType==='json'?this.response:this.responseType===''||this.responseType==='text'?this.responseText:null);},{once:true});
    return Reflect.apply(originalSend,this,args);
  }
  function stop(){
    clearTimeout(timer);
    if(window.fetch===fetchObserved)window.fetch=originalFetch;
    if(proto.open===openObserved)proto.open=originalOpen;
    if(proto.send===sendObserved)proto.send=originalSend;
    if(globalThis.__pikkoDownloadResponseStop===stop)delete globalThis.__pikkoDownloadResponseStop;
  }
  window.fetch=fetchObserved;proto.open=openObserved;proto.send=sendObserved;
  globalThis.__pikkoDownloadResponseStop=stop;
  timer=setTimeout(stop,120000);
}
