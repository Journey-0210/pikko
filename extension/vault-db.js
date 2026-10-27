/** Local-only media storage. Directory access is always read-only. */
const DB_NAME = 'advault-local-media-v2';
const DB_VERSION = 1;
let databasePromise;

export function openVaultDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');
        if (!db.objectStoreNames.contains('originals')) db.createObjectStore('originals');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = undefined; };
        resolve(db);
      };
      request.onerror = () => { databasePromise = undefined; reject(request.error); };
      request.onblocked = () => { databasePromise = undefined; reject(new Error('本地资料库被另一个窗口占用，请关闭旧窗口后重试。')); };
    });
  }
  return databasePromise;
}

async function transaction(storeName, mode, operation) {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    const request = operation(tx.objectStore(storeName));
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || request.error || new Error('本地资料库操作失败。'));
    tx.onabort = () => reject(tx.error || new Error('本地资料库操作已取消。'));
  });
}

export function saveDirectoryHandle(handle) {
  if (!handle || handle.kind !== 'directory') throw new Error('请选择文件夹。');
  return transaction('preferences', 'readwrite', store => store.put(handle, 'media-directory'));
}
export function loadDirectoryHandle() {
  return transaction('preferences', 'readonly', store => store.get('media-directory'));
}
export function forgetDirectoryHandle() {
  return transaction('preferences', 'readwrite', store => store.delete('media-directory'));
}
export function saveOriginal(blobId, file) {
  if (typeof blobId !== 'string' || !blobId || !(file instanceof Blob)) throw new Error('无效的本地文件。');
  return transaction('originals', 'readwrite', store => store.put(file, blobId));
}
export function getOriginal(blobId) {
  if (typeof blobId !== 'string' || !blobId) return Promise.resolve(undefined);
  return transaction('originals', 'readonly', store => store.get(blobId));
}
/** Used only to roll back an import before its metadata is committed. */
export function rollbackOriginal(blobId) {
  return transaction('originals', 'readwrite', store => store.delete(blobId));
}

export async function directoryPermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return 'unsupported';
  try { return await handle.queryPermission({ mode: 'read' }); }
  catch { return 'denied'; }
}

/** Call only from a direct user gesture. Never called during auto-loading. */
export function requestDirectoryPermission(handle) {
  if (!handle || typeof handle.requestPermission !== 'function') return Promise.resolve('unsupported');
  return handle.requestPermission({ mode: 'read' });
}

export function safeRelativeSegments(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) throw new Error('未记录原文件的相对路径。');
  if (/^[\\/]|^[a-zA-Z]:|[\u0000-\u001f]/.test(relativePath)) throw new Error('已阻止不安全的文件路径。');
  const segments = relativePath.replaceAll('\\', '/').split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes(':'))) {
    throw new Error('已阻止不安全的文件路径。');
  }
  for (const segment of segments) {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { decoded = segment; }
    if (decoded === '.' || decoded === '..' || /[\\/\u0000-\u001f]/.test(decoded)) throw new Error('已阻止不安全的文件路径。');
  }
  if (!segments.length) throw new Error('未记录原文件名。');
  return segments;
}

export async function readDirectoryOriginal(handle, relativePath) {
  if (!handle) throw new Error('请先关联下载文件夹。');
  if (await directoryPermission(handle) !== 'granted') throw new Error('请点击「重新授权」以读取本地原文件。');
  const segments = safeRelativeSegments(relativePath);
  let directory = handle;
  for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment, { create: false });
  const fileHandle = await directory.getFileHandle(segments.at(-1), { create: false });
  return fileHandle.getFile();
}

export async function readAssetOriginal(asset, directoryHandle) {
  if (asset.blobId) {
    const original = await getOriginal(asset.blobId);
    if (!(original instanceof Blob)) throw new Error('浏览器内的本地副本不存在，可能已清除扩展数据。请重新导入。');
    return original;
  }
  if (!asset.relativePath) throw new Error('没有可读取的原文件路径；请重新采集或导入原文件。');
  return readDirectoryOriginal(directoryHandle, asset.relativePath);
}

/** Verify supported media headers before persisting an imported original. */
export async function inspectDownloadedOriginal(file) {
  const bytes = new Uint8Array(await file.slice(0,80).arrayBuffer());
  const ascii=(start,length)=>String.fromCharCode(...bytes.slice(start,start+length));
  const starts=list=>list.every((value,index)=>bytes[index]===value);
  let mime;
  if(starts([0xff,0xd8,0xff]))mime='image/jpeg';
  else if(starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))mime='image/png';
  else if(['GIF87a','GIF89a'].includes(ascii(0,6)))mime='image/gif';
  else if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP')mime='image/webp';
  else if(ascii(4,4)==='ftyp')mime=/avif|avis/.test(ascii(8,64))?'image/avif':/qt  /.test(ascii(8,8))?'video/quicktime':'video/mp4';
  else if(starts([0x1a,0x45,0xdf,0xa3]))mime='video/webm';
  if(!mime)throw new Error('文件不是受支持的图片或视频');
  return validateImportedOriginal(new Blob([file],{type:mime}));
}

export async function validateImportedOriginal(file) {
  if (!(file instanceof Blob) || file.size === 0) throw new Error('原文件为空，无法导入。');
  const mime = file.type.toLowerCase();
  const head = new Uint8Array(await file.slice(0, 80).arrayBuffer());
  const ascii = (start, length) => String.fromCharCode(...head.slice(start, start + length));
  const starts = bytes => bytes.every((byte, index) => head[index] === byte);
  let valid = false;
  if (mime === 'image/jpeg') valid = starts([0xff, 0xd8, 0xff]);
  if (mime === 'image/png') valid = starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === 'image/gif') valid = ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
  if (mime === 'image/webp') valid = ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
  if (mime === 'image/avif') valid = ascii(4, 4) === 'ftyp' && /avif|avis/.test(ascii(8, 64));
  if (mime === 'video/webm') valid = starts([0x1a, 0x45, 0xdf, 0xa3]);
  if (['video/mp4', 'video/x-m4v'].includes(mime)) valid = ascii(4, 4) === 'ftyp';
  if (mime === 'video/quicktime') valid = ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(ascii(4, 4));
  if (!valid) throw new Error('文件内容与受支持的图片或视频格式不匹配；不会把网页或缩略图保存为原文件。');
  return { kind: mime.startsWith('video/') ? 'video' : 'image', mime };
}
