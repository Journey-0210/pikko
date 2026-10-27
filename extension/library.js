import { safePage } from './core.js';
import { setupMediaViewer } from './media-viewer.js';
import { normalizeResearch, researchText, researchCSV } from './research.js';
import { loadDirectoryHandle, saveDirectoryHandle, forgetDirectoryHandle, directoryPermission, requestDirectoryPermission, readAssetOriginal, saveOriginal, rollbackOriginal, validateImportedOriginal } from './vault-db.js';

const $ = id => document.getElementById(id);
const detailViewer = setupMediaViewer($('detail-media'), $('detail-viewer-toolbar'), $('asset-dialog'));
const state = { folders: [], assets: [], settings: {} };
const view = { mode: 'all', folderId: null, search: '', kind: 'all', platform: 'all', rating: 0, descendants: true, sort: 'rating', layout: 'grid', year: 'all', startMonth: 1, endMonth: 12, periodSource: 'folder' };
try {
  const saved = JSON.parse(localStorage.getItem('pikko-library-ui-v1') || '{}');
  if (['grid','compact','list','overview'].includes(saved.layout)) view.layout = saved.layout;
  if (['rating','newest','oldest','title','running'].includes(saved.sort)) view.sort = saved.sort;
} catch {}
function saveViewPreferences() { try { localStorage.setItem('pikko-library-ui-v1', JSON.stringify({layout:view.layout,sort:view.sort})); } catch {} }
function animateSurface(node, frames, duration = 180) {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) node.animate(frames,{duration,easing:'cubic-bezier(.2,.7,.2,1)'});
}
let directoryHandle = null;
let directoryAccess = 'prompt';
let expandedFolders = new Set();
let renderVersion = 0;
let reloadVersion = 0;
let previewObserver;
let previewQueue = [];
let previewActive = 0;
const gridURLs = new Set();
let detailURL = null;
let detailBlob = null;
let detailVersion = 0;
let detailAssetId = null;
let detailRating = 0;
let detailDirty = false;
let detailSaving = false;
let detailObservedStatus = null;
let folderMode = null;
let toastTimer;
let importBusy = false;
let importFolderId = null;
let confirmResolver = null;
let stateSignature = '';
let pendingPollTimer;
const IMPORT_TYPES = new Map([['image/jpeg', 'image'], ['image/png', 'image'], ['image/gif', 'image'], ['image/webp', 'image'], ['image/avif', 'image'], ['video/mp4', 'video'], ['video/webm', 'video'], ['video/quicktime', 'video'], ['video/x-m4v', 'video']]);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function errorMessage(error) {
  if (error?.name === 'NotFoundError') return '找不到原文件。文件可能已被移动、重命名或删除，请检查关联的 AdVault 文件夹。';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return '未获准读取这个文件夹。请点击重新授权，或重新选择 AdVault 文件夹。';
  if (error?.name === 'QuotaExceededError') return '浏览器本地存储空间不足，无法导入。已下载的硬盘原文件不受影响。';
  return typeof error === 'string' ? error : (error?.message || '操作未完成，请重试。');
}
function toast(message, isError = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', isError);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, isError ? 7000 : 4200);
}
async function rpc(message) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('请在 Chrome 扩展中打开 pikko. 素材库，而不是直接打开此 HTML 文件。');
  const response = await chrome.runtime.sendMessage(message);
  if (response === undefined || response === null) throw new Error('扩展服务没有响应，请刷新后重试。');
  if (response.error || response.ok === false || response.success === false) {
    const error = new Error(typeof response.error === 'string' ? response.error : response.error?.message || response.message || '操作未完成。');
    error.definitiveRejection = true;
    throw error;
  }
  return response;
}
async function reloadState() {
  const version = ++reloadVersion;
  try {
    const response = await rpc({ type: 'state' });
    if (version !== reloadVersion) return;
    const next = response.state || response.data || response;
    if (!Array.isArray(next.folders) || !Array.isArray(next.assets)) throw new Error('扩展返回了无效的素材数据，请重新加载扩展。');
    const signature = JSON.stringify([next.folders, next.assets, next.settings || {}]);
    const changed = signature !== stateSignature;
    stateSignature = signature;
    state.folders = next.folders;
    state.assets = next.assets;
    state.settings = next.settings || {};
    if (view.folderId && !state.folders.some(folder => folder.id === view.folderId)) { view.folderId = null; view.mode = 'all'; }
    $('load-error').hidden = true;
    if (changed) render();
    clearTimeout(pendingPollTimer);
    if (state.assets.some(asset => asset.status === 'pending' || asset.sourceNote?.status === 'pending')) pendingPollTimer = setTimeout(reloadState, 1000);
    if (detailAssetId && !state.assets.some(asset => asset.id === detailAssetId)) closeDetail();
    else if (detailAssetId) {
      const current = state.assets.find(asset => asset.id === detailAssetId);
      $('detail-status').textContent = statusLabel(current);
      if (current.status + ':' + (current.sourceNote?.status || '') !== detailObservedStatus && !detailDirty && !detailSaving) openDetail(detailAssetId);
    }
  } catch (error) {
    if (version !== reloadVersion) return;
    $('load-error').textContent = errorMessage(error);
    $('load-error').hidden = false;
  }
}
function folderById(id) { return state.folders.find(folder => folder.id === id); }
function folderPath(id) {
  const names = [];
  const visited = new Set();
  let folder = folderById(id);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id); names.unshift(folder.name); folder = folderById(folder.parentId);
  }
  return names.join(' / ') || '未归档';
}
function folderDescendants(id) {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of state.folders) {
      if (result.has(folder.parentId) && !result.has(folder.id)) { result.add(folder.id); changed = true; }
    }
  }
  return result;
}
// A month belongs to the user's folder hierarchy, never the download date by accident.
function folderPeriod(id) {
  const chain = [], seen = new Set(); let folder = folderById(id);
  while (folder && !seen.has(folder.id)) { seen.add(folder.id); chain.unshift(folder); folder = folderById(folder.parentId); }
  let year = null, month = null;
  for (const item of chain) {
    const name = String(item.name).normalize('NFKC').trim();
    const pair = name.match(/^(20\d{2})\s*(?:[-_.\/年]|\s)\s*(0?[1-9]|1[0-2])(?:月)?(?:\s.*)?$/);
    const y = name.match(/^(20\d{2})年?$/);
    const m = name.match(/^(0?[1-9]|1[0-2])月?$/);
    if (pair) { year = Number(pair[1]); month = Number(pair[2]); }
    else if (y) { year = Number(y[1]); month = null; }
    else if (m) month = Number(m[1]);
  }
  return year && month ? `${year}-${String(month).padStart(2,'0')}` : null;
}
function assetPeriod(asset) {
  if (view.periodSource !== 'collected') return folderPeriod(asset.folderId);
  const date = new Date(asset.createdAt);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}` : null;
}
function matchesPeriod(asset) {
  if (view.year === 'all' && (view.startMonth || 1) === 1 && (view.endMonth || 12) === 12) return true;
  const period = assetPeriod(asset);
  if (!period) return false;
  return (view.year === 'all' || Number(period.slice(0,4)) === Number(view.year)) && Number(period.slice(5)) >= (view.startMonth || 1) && Number(period.slice(5)) <= (view.endMonth || 12);
}
function orderedFolders(folders) {
  const dateKey=folder=>{
    const period=folderPeriod(folder.id);
    if(period)return Number(period.replace('-',''));
    const name=String(folder.name).normalize('NFKC').trim();
    const year=name.match(/^(20\d{2})年?$/),month=name.match(/^(0?[1-9]|1[0-2])月?$/);
    return year?Number(year[1])*100:month?Number(month[1]):0;
  };
  return [...folders].sort((a,b)=>dateKey(b)-dateKey(a));
}
function folderCount(id) {
  const ids = folderDescendants(id);
  return state.assets.filter(asset => ids.has(asset.folderId)).length;
}
function chooseView(mode, folderId = null) {
  if(view.folderId!==folderId || view.mode!==mode){view.year='all';view.startMonth=1;view.endMonth=12;}
  view.mode = mode; view.folderId = folderId;
  let parent = folderById(folderId); const seen = new Set();
  while (parent && !seen.has(parent.id)) { seen.add(parent.id); expandedFolders.add(parent.id); parent = folderById(parent.parentId); }
  render();
  animateSurface($('folder-shelf'),[{opacity:.45,transform:'translateY(5px)'},{opacity:1,transform:'none'}]);
}
function renderFolders() {
  const container = $('folder-tree');
  container.replaceChildren();
  const seen = new Set();
  function appendFolder(folder, depth) {
    if (seen.has(folder.id)) return;
    seen.add(folder.id);
    const children = orderedFolders(state.folders.filter(item => item.parentId === folder.id && item.id !== folder.id));
    const row = element('div', `folder-row${view.folderId === folder.id ? ' active' : ''}`);
    row.style.paddingLeft = `${Math.min(depth, 8) * 14 + 3}px`;
    const expander = element('button', `folder-chevron${children.length ? '' : ' empty'}`);
    expander.type = 'button';
    expander.setAttribute('aria-label', `${expandedFolders.has(folder.id) ? '收起' : '展开'} ${folder.name}`);
    expander.setAttribute('aria-expanded', String(expandedFolders.has(folder.id)));
    expander.tabIndex = children.length ? 0 : -1;
    expander.addEventListener('click', () => { expandedFolders.has(folder.id) ? expandedFolders.delete(folder.id) : expandedFolders.add(folder.id); renderFolders(); });
    const button = element('button', 'folder-select');
    button.type = 'button'; button.title = folderPath(folder.id);
    if (view.folderId === folder.id) button.setAttribute('aria-current', 'page');
    button.append(element('span', 'folder-icon', '▱'), element('span', '', folder.name));
    button.addEventListener('click', () => chooseView('folder', folder.id));
    row.append(expander, button, element('span', 'folder-count', folderCount(folder.id)));
    container.append(row);
    if (expandedFolders.has(folder.id)) for (const child of children) appendFolder(child, depth + 1);
  }
  const roots = orderedFolders(state.folders.filter(folder => !folder.parentId || !folderById(folder.parentId)));
  for (const folder of roots) appendFolder(folder, 0);
  // Malformed/cyclic legacy folders remain reachable, without recursive loops.
  if (!roots.length && state.folders.length) appendFolder(state.folders[0], 0);
  if (!state.folders.length) container.append(element('p', 'folder-empty', '暂无文件夹。点击 ＋ 新建。'));
}
function filteredAssets(ignorePeriod = false) {
  const folderIds = view.folderId ? (view.descendants ? folderDescendants(view.folderId) : new Set([view.folderId])) : null;
  const needle = view.search.toLocaleLowerCase().trim();
  const recent = Date.now() - 7 * 24 * 3600 * 1000;
  const result = state.assets.filter(asset => {
    if (folderIds && !folderIds.has(asset.folderId)) return false;
    if (!ignorePeriod && !matchesPeriod(asset)) return false;
    if (view.mode === 'starred' && Number(asset.rating || 0) < 1) return false;
    if (view.mode === 'recent' && new Date(asset.createdAt).getTime() < recent) return false;
    if (view.kind !== 'all' && asset.kind !== view.kind) return false;
    if (view.platform !== 'all' && (asset.platform || '其他') !== view.platform) return false;
    if (Number(asset.rating || 0) < view.rating) return false;
    return !needle || [asset.title, asset.notes, asset.research?.adId, asset.research?.advertiser, asset.research?.adAccount, asset.research?.adText, ...(Array.isArray(asset.tags) ? asset.tags : [])].join(' ').toLocaleLowerCase().includes(needle);
  });
  result.sort((a, b) => {
    if (view.sort === 'rating') return Number(b.rating || 0) - Number(a.rating || 0) || new Date(b.createdAt) - new Date(a.createdAt);
    if (view.sort === 'running') return (b.research?.runningDays ?? -1) - (a.research?.runningDays ?? -1) || new Date(b.createdAt) - new Date(a.createdAt);
    if (view.sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
    return (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
  });
  if (view.sort === 'oldest') result.reverse();
  return result;
}
function statusLabel(asset) {
  return asset.status==='imported'&&asset.relativePath?'已导入本地原文件':{ pending: '下载中', downloaded: '已下载原文件', failed: '下载失败', imported: '浏览器内副本' }[asset.status] || '已收藏';
}
function dateLabel(value, full = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '日期未知';
  return new Intl.DateTimeFormat('zh-CN', full ? { dateStyle: 'medium', timeStyle: 'short' } : { month: '2-digit', day: '2-digit' }).format(date);
}
function createRating(value, onChange, className = '') {
  const container = element('div', `rating ${className}`);
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', `评分 ${value || 0} 星；再次点击当前星级可清除`);
  for (let star = 1; star <= 5; star++) {
    const button = element('button', `star${star <= value ? ' filled' : ''}`, star <= value ? '★' : '☆');
    button.type = 'button'; button.title = value === star ? '清除评分' : `${star} 星`;
    button.setAttribute('aria-label', button.title); button.setAttribute('aria-pressed', String(star <= value));
    button.addEventListener('click', event => { event.stopPropagation(); onChange(value === star ? 0 : star, container); });
    container.append(button);
  }
  return container;
}
function placeholder(asset, message) {
  const node = element('div', `preview-placeholder${asset.status === 'failed' ? ' failed' : ''}`);
  node.append(element('span', 'placeholder-icon', asset.kind === 'video' ? '▷' : '▧'), element('span', 'placeholder-copy', message));
  return node;
}
function previewMessage(asset) {
  if (asset.status === 'pending') return '原文件下载中…';
  if (asset.status === 'failed') return '下载失败 · 点击查看原因';
  if (!asset.blobId && !directoryHandle) return '关联文件夹即可预览';
  if (!asset.blobId && directoryAccess !== 'granted') return '重新授权即可预览';
  return '读取本地原文件…';
}
function clearGridMedia() {
  renderVersion++;
  previewObserver?.disconnect();
  previewQueue = [];
  for (const video of $('asset-grid').querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
  for (const url of gridURLs) URL.revokeObjectURL(url);
  gridURLs.clear();
}
function schedulePreview(asset, button, card, version) {
  if (asset.status === 'pending' || asset.status === 'failed') return;
  if (!asset.blobId && (!directoryHandle || directoryAccess !== 'granted')) return;
  previewQueue.push({ asset, button, card, version });
  pumpPreviews();
}
function pumpPreviews() {
  while (previewActive < 4 && previewQueue.length) {
    const entry = previewQueue.shift();
    if (entry.version !== renderVersion) continue;
    previewActive++;
    loadCardPreview(entry).finally(() => { previewActive--; pumpPreviews(); });
  }
}
async function loadCardPreview({ asset, button, card, version }) {
  card.classList.add('preview-loading');
  try {
    const file = await readAssetOriginal(asset, directoryHandle);
    if (version !== renderVersion || !button.isConnected) return;
    const url = URL.createObjectURL(file); gridURLs.add(url);
    const media = element(asset.kind === 'video' ? 'video' : 'img', 'card-media');
    if (asset.kind === 'video') {
      media.muted = true; media.playsInline = true; media.preload = 'metadata';
      media.addEventListener('loadedmetadata', () => { if (media.duration > .1 && Number.isFinite(media.duration)) { try { media.currentTime = Math.min(.1, media.duration / 2); } catch {} } }, { once: true });
    } else { media.alt = asset.title || '素材原图'; media.loading = 'lazy'; }
    media.addEventListener('error', () => {
      if (version !== renderVersion) return;
      media.replaceWith(placeholder(asset, '已找到原文件，但当前浏览器无法解码'));
      URL.revokeObjectURL(url); gridURLs.delete(url);
    }, { once: true });
    media.src = url;
    const previous = button.querySelector('.preview-placeholder');
    if (previous) previous.replaceWith(media);
  } catch (error) {
    if (version !== renderVersion || !button.isConnected) return;
    const previous = button.querySelector('.preview-placeholder');
    if (previous) previous.replaceWith(placeholder(asset, error?.name === 'NotFoundError' ? '找不到原文件 · 点击查看' : '无法读取原文件 · 点击查看'));
    button.title = errorMessage(error);
  } finally { card.classList.remove('preview-loading'); }
}
function renderCards(assets) {
  clearGridMedia();
  const version = renderVersion;
  const grid = $('asset-grid'); grid.replaceChildren(); grid.className = `asset-grid ${view.layout}`;
  if (view.layout === 'overview') return;
  const entries = new WeakMap();
  if ('IntersectionObserver' in window) {
    previewObserver = new IntersectionObserver(observations => {
      for (const observation of observations) if (observation.isIntersecting) {
        previewObserver.unobserve(observation.target);
        const entry = entries.get(observation.target);
        if (entry) schedulePreview(entry.asset, entry.button, observation.target, version);
      }
    }, { rootMargin: '280px' });
  }
  for (const asset of assets) {
    const card = element('article', 'asset-card'); card.dataset.assetId = asset.id;
    const preview = element('button', `asset-preview-button ${asset.kind === 'video' ? 'video' : 'image'}`);
    preview.type = 'button'; preview.setAttribute('aria-label', `查看 ${asset.title || '未命名素材'}`);
    preview.append(placeholder(asset, previewMessage(asset)));
    const badges = element('div', 'card-top-badges');
    badges.append(element('span', 'platform-pill', asset.platform || '其他'), element('span', 'kind-pill', asset.kind === 'video' ? '视频' : '图片'));
    preview.append(badges);
    if (asset.kind === 'video') { const play = element('div', 'play-indicator'); play.append(element('span', '', '▶')); preview.append(play); }
    preview.addEventListener('click', () => openDetail(asset.id));
    const content = element('div', 'card-content');
    const title = element('button', 'card-title', asset.title || '未命名素材'); title.type = 'button'; title.title = asset.title || '未命名素材';
    title.addEventListener('click', () => openDetail(asset.id));
    const folder = element('div', 'card-folder', `▱ ${view.folderId === asset.folderId ? '当前文件夹' : folderPath(asset.folderId)}`); folder.title = folderPath(asset.folderId);
    const tags = element('div', 'card-tags');
    for (const tag of (Array.isArray(asset.tags) ? asset.tags : []).slice(0, 3)) {
      const chip = element('button', 'tag tag-button', tag); chip.type = 'button'; chip.title = `搜索标签：${tag}`;
      chip.addEventListener('click', () => { view.search = String(tag); $('search').value = view.search; render(); }); tags.append(chip);
    }
    if ((asset.tags || []).length > 3) tags.append(element('span', 'tag', `+${asset.tags.length - 3}`));
    const footer = element('div', 'card-footer');
    footer.append(createRating(Number(asset.rating || 0), async (rating, container) => {
      for (const button of container.querySelectorAll('button')) button.disabled = true;
      try { await rpc({ type: 'asset.update', id: asset.id, patch: { rating } }); await reloadState(); const current=$('asset-grid').querySelector(`[data-asset-id="${CSS.escape(asset.id)}"] .rating`); if(current)animateSurface(current,[{transform:'scale(.95)'},{transform:'scale(1)'}],220); }
      catch (error) { toast(errorMessage(error), true); for (const button of container.querySelectorAll('button')) button.disabled = false; }
    }), element('span', 'card-date', dateLabel(asset.createdAt)));
    const rename = element('button', 'rename-asset', '✎'); rename.type = 'button'; rename.title = '重命名'; rename.setAttribute('aria-label', `重命名 ${asset.title || '未命名资料'}`);
    rename.addEventListener('click', () => startRename(asset, title));
    const titleRow = element('div','card-title-row'); titleRow.append(title,rename);
    const kind = element('span','file-kind',asset.kind === 'video' ? '▷' : '▧'); kind.setAttribute('aria-hidden','true'); titleRow.prepend(kind);
    content.append(titleRow, folder, tags, footer);
    if (asset.status !== 'downloaded') { const status = element('div', `card-status${asset.status === 'failed' ? ' error' : ''}`, asset.status === 'failed' ? `下载失败：${asset.error || '请查看详情'}` : statusLabel(asset)); status.title = status.textContent; content.append(status); }
    card.append(preview, content); grid.append(card);
    entries.set(card, { asset, button: preview });
    if (view.layout !== 'list') { if (previewObserver) previewObserver.observe(card); else schedulePreview(asset, preview, card, version); }
  }
}
function startRename(asset, title) {
  if (title.parentElement.querySelector('input')) return;
  const input = element('input','inline-title'); input.value = asset.title || ''; input.maxLength = 250;
  input.setAttribute('aria-label','修改资料名称'); input.title='Enter 保存，Esc 取消'; title.hidden = true; title.after(input); input.focus(); input.select();
  let saving = false;
  const close = () => {input.remove();title.hidden = false;};
  const commit = async () => {
    if(saving || !input.isConnected)return;
    const name = input.value.trim();
    if (!name) {input.setCustomValidity('请输入名称');input.reportValidity();return;}
    input.setCustomValidity(''); saving = true; input.disabled = true;
    try {await rpc({type:'asset.update',id:asset.id,patch:{title:name}});await reloadState();toast('名称已保存');}
    catch(error) {saving=false;input.disabled=false;toast(errorMessage(error),true);input.focus();}
  };
  input.addEventListener('input',()=>input.setCustomValidity(''));
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='Enter'&&!event.isComposing){event.preventDefault();commit();}
  });
  input.addEventListener('blur',()=>{if(input.isConnected)commit();});
}
function renderFolderShelf() {
  const shelf = $('folder-shelf'); shelf.replaceChildren();
  const current=folderById(view.folderId);
  const children = state.folders.filter(f => (f.parentId || null) === (view.folderId || null));
  const peers=current&&!children.length;
  const folders=orderedFolders(peers?state.folders.filter(f=>(f.parentId||null)===(current.parentId||null)):children);
  shelf.hidden = !folders.length;
  shelf.setAttribute('aria-label',peers?'同级文件夹':'子文件夹');
  document.body.classList.toggle('has-subfolders',!!folders.length);
  if(peers){
    const up=element('button','folder-shelf-item folder-up',`↑ ${folderById(current.parentId)?.name||'资料库'}`);up.type='button';up.setAttribute('aria-label','返回上一级文件夹');
    up.addEventListener('click',()=>chooseView(current.parentId?'folder':'all',current.parentId||null));shelf.append(up);
  }
  for (const folder of folders) {
    const button = element('button','folder-shelf-item'); button.type = 'button';button.title = folderPath(folder.id);
    if(folder.id===view.folderId){button.classList.add('current');button.setAttribute('aria-current','page');}
    button.append(element('span','folder-icon'),element('span','shelf-name',folder.name),element('span','shelf-count',folderCount(folder.id)));
    button.addEventListener('click',()=>chooseView('folder',folder.id)); shelf.append(button);
  }
}
function renderFolderSpines() {
  const rack=$('folder-spines');rack.replaceChildren();
  let current=folderById(view.folderId);
  // A platform inside a month keeps the neighbouring month folders at hand.
  if(current && folderPeriod(current.id)){
    const seen=new Set();
    while(current.parentId && folderPeriod(current.parentId) && !seen.has(current.id)){
      seen.add(current.id);current=folderById(current.parentId);
    }
  }
  const siblings=orderedFolders(state.folders.filter(f=>(f.parentId||null)===(current?.parentId||null)));
  const index=current?siblings.findIndex(f=>f.id===current.id):-1;
  const nearby=current?[...siblings.slice(index+1),...siblings.slice(0,index).reverse()]:siblings;
  const visible=nearby.slice(0,3);
  document.documentElement.style.setProperty('--spine-space',`${visible.length*29+22}px`);
  for(const [index,folder] of visible.entries()){
    const button=element('button','folder-spine');button.type='button';button.style.setProperty('--stack',index);
    button.setAttribute('aria-label',`打开侧叠文件夹 ${folderPath(folder.id)}`);button.title=folderPath(folder.id);
    button.append(element('span','spine-number',folderPeriod(folder.id)?.slice(5)||folder.name.slice(0,1)),element('span','spine-label',folder.name),element('span','spine-count',`${folderCount(folder.id)} 份`));
    button.addEventListener('click',()=>chooseView('folder',folder.id));rack.append(button);
  }
}
function renderBreadcrumb(folder, title) {
  const target = $('breadcrumb-name'); target.replaceChildren(); const chain = [],seen=new Set();
  while(folder && !seen.has(folder.id)){seen.add(folder.id);chain.unshift(folder);folder=folderById(folder.parentId);}
  if (!chain.length) target.append(element('span','',title));
  chain.forEach((item,index)=>{const button=element('button','',item.name);button.type='button';button.addEventListener('click',()=>chooseView('folder',item.id));if(index===chain.length-1)button.setAttribute('aria-current','page');target.append(button);});
}
function renderPeriodControls() {
  const years = [...new Set([...state.assets.map(assetPeriod),...state.folders.map(f=>folderPeriod(f.id))].filter(Boolean).map(p=>p.slice(0,4)))].sort().reverse();
  if(view.year !== 'all' && !years.includes(String(view.year)))years.unshift(String(view.year));
  $('period-year').replaceChildren(new Option('全部年份','all'),...years.map(y=>new Option(`${y} 年`,y)));
  $('period-year').value=view.year;
  for(const [id,key] of [['period-start','startMonth'],['period-end','endMonth']]){
    $(id).replaceChildren(...Array.from({length:12},(_,i)=>new Option(`${i+1} 月`,i+1)));$(id).value=view[key];
  }
  $('period-source').value=view.periodSource;$('sort').value=view.sort;
  $('period-current').textContent=`时间：${view.year==='all'?'全部年份':view.year+' 年'} · ${view.startMonth===1&&view.endMonth===12?'全年':view.startMonth+'–'+view.endMonth+' 月'} · ${view.periodSource==='folder'?'文件夹月份':'收藏月份'}`;
  for(const b of document.querySelectorAll('[data-layout]')){b.classList.toggle('active',b.dataset.layout===view.layout);b.setAttribute('aria-pressed',String(b.dataset.layout===view.layout));}
  const unknown=filteredAssets(true).filter(a=>!assetPeriod(a)).length;
  $('period-summary').textContent=unknown?`${unknown} 份未标月份` : '';
  $('period-summary').title='未标月份的资料在全部时间中显示';
}
function renderOverview() {
  const container=$('month-overview');container.replaceChildren();container.hidden=view.layout!=='overview';
  if(view.layout!=='overview')return;
  const scoped=filteredAssets(true), scopeIds=view.folderId?folderDescendants(view.folderId):null;
  const years=[...new Set([...scoped.map(assetPeriod),...state.folders.filter(f=>!scopeIds||scopeIds.has(f.id)).map(f=>folderPeriod(f.id))].filter(Boolean).map(p=>p.slice(0,4)))].sort().reverse();
  const shown=view.year==='all'?years:[String(view.year)];
  for(const year of shown){
    const section=element('section','year-section');const heading=element('div','year-heading');heading.append(element('h2','',view.startMonth===1&&view.endMonth===12?year:`${year} · ${view.startMonth}–${view.endMonth} 月`),element('span','',`${scoped.filter(a=>assetPeriod(a)?.startsWith(year+'-')&&matchesPeriod(a)).length} 份资料`));section.append(heading);
    const months=element('div','months-grid');
    for(let month=view.startMonth;month<=view.endMonth;month++){
      const key=`${year}-${String(month).padStart(2,'0')}`, assets=scoped.filter(a=>assetPeriod(a)===key);
      const button=element('button',`month-card${assets.length?' populated':''}`);button.type='button';button.setAttribute('aria-label',`查看 ${key}，${assets.length} 份资料`);
      const top=element('div','month-card-top');top.append(element('strong','',String(month).padStart(2,'0')),element('span','','月'));
      const lines=element('div','month-lines'); const leaves=[...new Set(assets.map(a=>a.folderId))];
      for(const id of leaves.slice(0,3)){const line=element('div','');line.append(element('span','',folderPath(id)),element('b','',assets.filter(a=>a.folderId===id).length));lines.append(line);}
      if(leaves.length>3)lines.append(element('span','month-more',`另 ${leaves.length-3} 个文件夹`));
      if(!assets.length)lines.append(element('span','month-empty','暂无资料'));
      const bottom=element('div','month-card-bottom');bottom.append(element('span','',`${assets.length} 份资料`),element('span','',`4–5 星：${assets.filter(a=>a.rating>=4).length} 份`));
      button.append(top,lines,bottom);button.addEventListener('click',()=>{
        view.layout='grid';saveViewPreferences();
        const folders=state.folders.filter(f=>(!scopeIds||scopeIds.has(f.id))&&folderPeriod(f.id)===key&&folderPeriod(f.parentId)!==key);
        if(view.periodSource==='folder'&&folders.length===1)chooseView('folder',folders[0].id);
        else{view.year=year;view.startMonth=month;view.endMonth=month;render();}
      });months.append(button);
    }
    section.append(months);container.append(section);
  }
  const unknown=scoped.filter(a=>!assetPeriod(a));
  if(unknown.length){const line=element('button','unfiled-month',`${unknown.length} 份资料未标月份 · 查看全部资料`);line.addEventListener('click',()=>{view.year='all';view.startMonth=1;view.endMonth=12;view.layout='list';render();});container.append(line);}
  if(!shown.length&&!unknown.length)container.append(element('p','overview-empty','暂无月份记录。可建立「2026-10」文件夹，或切换到收藏月份查看。'));
}
function render() {
  $('all-count').textContent = state.assets.length;
  $('starred-count').textContent = state.assets.filter(asset => Number(asset.rating) > 0).length;
  for (const button of $('main-nav').querySelectorAll('[data-view]')) button.classList.toggle('active', button.dataset.view === view.mode);
  const folder = folderById(view.folderId);
  const title = folder ? folder.name : { all: '全部资料', starred: '已评分', recent: '最近收藏' }[view.mode] || '全部资料';
  $('view-title').textContent = title;
  renderBreadcrumb(folder,title);
  $('view-description').textContent = '';
  $('folder-actions').open=false;
  for (const id of ['descendants-label', 'folder-rename', 'folder-delete', 'folder-actions']) $(id).hidden = !folder;
  $('folder-materialize').hidden=!folder||!globalThis.chrome?.runtime?.getManifest;
  renderFolders();
  renderFolderShelf(); renderFolderSpines(); renderPeriodControls();
  const assets = filteredAssets();
  $('export-research').hidden = !assets.some(asset => asset.research?.provider === 'BigSpy');
  $('result-count').textContent = assets.length;
  renderCards(assets);
  renderOverview();
  $('list-heading').hidden=view.layout!=='list'||!assets.length;
  $('empty-state').hidden = assets.length > 0 || view.layout==='overview';
  $('asset-grid').hidden = assets.length === 0 || view.layout==='overview';
  const filtered = view.search || view.kind !== 'all' || view.platform !== 'all' || view.rating > 0 || view.year !== 'all' || view.startMonth!==1 || view.endMonth!==12;
  $('empty-title').textContent = filtered ? '没有找到匹配的资料' : view.mode === 'starred' ? '还没有评过分的资料' : folder ? '文件夹为空' : view.mode === 'recent' ? '最近 7 天还没有新收藏' : '暂无资料';
  $('empty-description').textContent = filtered ? '试试其他关键词，或点击筛选栏右侧的重置按钮。' : view.mode === 'starred' ? '设置星级后在此显示。' : '点击图片或视频上的 pikko. 按钮，选择文件夹即可收藏。也可以导入已有的图片和视频原文件。';
  $('empty-import').hidden = !!filtered || view.mode === 'starred';
}

function renderDirectoryStatus() {
  const supported = typeof window.showDirectoryPicker === 'function';
  $('directory-choose').hidden = !supported;
  $('directory-authorize').hidden = !directoryHandle || directoryAccess === 'granted';
  $('directory-forget').hidden = !directoryHandle;
  $('directory-panel').classList.toggle('connected', !!directoryHandle && directoryAccess === 'granted');
  $('directory-toggle').textContent=directoryHandle&&directoryAccess==='granted'?'原文件已连接':'连接原文件';
  $('directory-choose').textContent = directoryHandle ? '更换文件夹' : '关联文件夹';
  if (!supported) {
    $('directory-title').textContent = '此浏览器不支持文件夹关联';
    $('directory-description').textContent = '可使用 Chrome 打开扩展。导入的原文件会保存到下载目录中的 AdVault。';
  } else if (!directoryHandle) {
    $('directory-title').textContent = '连接原文件';
    $('directory-description').textContent = '选择 下载 / AdVault 文件夹。';
  } else if (directoryAccess === 'granted') {
    $('directory-title').textContent = `已连接 ${directoryHandle.name}`;
    $('directory-description').textContent = '';
  } else {
    $('directory-title').textContent = `已记住 ${directoryHandle.name} · 需要读取授权`;
    $('directory-description').textContent = '浏览器可能在重启后收回授权。点击「重新授权」，不会申请写入权限。';
  }
}
async function initializeDirectory() {
  try { directoryHandle = await loadDirectoryHandle(); directoryAccess = await directoryPermission(directoryHandle); }
  catch (error) { toast(`无法恢复本地目录：${errorMessage(error)}`, true); }
  renderDirectoryStatus();
  render();
}
$('directory-choose').addEventListener('click', async () => {
  // The picker is invoked synchronously from this user gesture, before other awaits.
  let handle;
  try { handle = await window.showDirectoryPicker({ id: 'advault-originals', mode: 'read', startIn: 'downloads' }); }
  catch (error) { if (error.name !== 'AbortError') toast(errorMessage(error), true); return; }
  directoryHandle = handle;
  directoryAccess = await directoryPermission(handle);
  try { await saveDirectoryHandle(handle); toast(`已连接 ${handle.name}`); }
  catch (error) { toast(`当前可读取，但无法记住此目录：${errorMessage(error)}`, true); }
  renderDirectoryStatus(); render();
});
$('directory-authorize').addEventListener('click', async () => {
  try {
    const permission = requestDirectoryPermission(directoryHandle);
    directoryAccess = await permission;
    renderDirectoryStatus(); render();
    if (directoryAccess !== 'granted') toast('未授权读取。你仍可整理记录，或导入原文件副本。', true);
  } catch (error) { toast(errorMessage(error), true); }
});
$('directory-forget').addEventListener('click', async () => {
  try { await forgetDirectoryHandle(); directoryHandle = null; directoryAccess = 'prompt'; renderDirectoryStatus(); render(); toast('已断开连接'); }
  catch (error) { toast(errorMessage(error), true); }
});

function fillFolderSelect(select, selected) {
  select.replaceChildren();
  const seen = new Set();
  function add(folder, level) {
    if (seen.has(folder.id)) return;
    seen.add(folder.id);
    const option = element('option', '', folderPath(folder.id));
    option.value = folder.id; select.append(option);
    for (const child of state.folders.filter(item => item.parentId === folder.id)) add(child, level + 1);
  }
  for (const root of state.folders.filter(folder => !folder.parentId || !folderById(folder.parentId))) add(root, 0);
  for (const folder of state.folders) if (!seen.has(folder.id)) add(folder, 0);
  if (!folderById(selected)) { const option = element('option', '', '请选择文件夹'); option.value = ''; select.prepend(option); }
  select.value = selected || '';
}
function renderDetailRating() {
  const rating = createRating(detailRating, value => { detailRating = value; detailDirty = true; renderDetailRating(); }, 'detail-rating');
  $('detail-rating').replaceChildren(...rating.childNodes);
  $('detail-rating').setAttribute('aria-label', `评分 ${detailRating} 星`);
}
async function openDetail(id) {
  const asset = state.assets.find(item => item.id === id);
  if (!asset) return;
  if (detailAssetId && detailDirty) { if (!await askConfirm('放弃未保存的修改？', '当前修改尚未保存。继续将放弃这些修改。', '放弃修改')) return; }
  clearDetailMedia();
  detailAssetId = id; detailObservedStatus = asset.status + ':' + (asset.sourceNote?.status || ''); detailDirty = false; detailRating = Number(asset.rating || 0);
  $('detail-title').value = asset.title || '未命名素材';
  $('detail-notes').value = asset.notes || '';
  $('detail-tags').value = (asset.tags || []).join(', ');
  fillFolderSelect($('detail-folder'), asset.folderId);
  renderDetailRating();
  const research = normalizeResearch(asset.research);
  $('detail-research').hidden = !research; $('detail-research').open = false;
  $('detail-research-summary').textContent = `BigSpy${research?.runningDays !== undefined ? ` · ${research.runningDays} 天` : ''}`;
  $('detail-research-text').value = researchText(research, safePage(asset.sourcePage));
  $('detail-status').textContent = statusLabel(asset);
  $('detail-platform').textContent = asset.platform || '其他';
  $('detail-date').textContent = dateLabel(asset.createdAt, true);
  $('detail-filename').textContent = asset.relativePath || asset.filename || asset.title || '未记录文件名';
  $('detail-filename').title = $('detail-filename').textContent;
  $('detail-error').hidden = !asset.error;
  $('detail-error').textContent = asset.error ? `下载错误：${asset.error}` : '';
  $('detail-reveal').hidden = asset.downloadId === undefined || asset.downloadId === null || !['downloaded','imported'].includes(asset.status);
  $('detail-save-file').hidden = true;
  $('detail-source').hidden = true; $('detail-source').removeAttribute('href');
  const source = safePage(asset.sourcePage);
  $('detail-source-url').value = source;
  $('detail-source-url').placeholder = '没有记录来源链接';
  $('detail-copy-source').hidden = !source;
  $('detail-source-note').hidden = !source || asset.status !== 'downloaded' || !asset.relativePath;
  $('detail-source-note').disabled = asset.sourceNote?.status === 'pending';
  $('detail-source-help').textContent = source && !asset.sourceLinkVersion ? '旧记录的来源链接可能不完整。' : '';
  $('detail-source-note-status').textContent = asset.sourceNote?.status === 'downloaded' ? '来源说明已保存' : asset.sourceNote?.status === 'pending' ? '正在保存来源说明…' : asset.sourceNote?.error || '';
  $('detail-source-note-status').title = asset.sourceNote?.relativePath || '';
  if (source) { $('detail-source').href = source; $('detail-source').hidden = false; }

  $('detail-media-message').textContent = '';
  $('detail-media').replaceChildren(placeholder(asset, previewMessage(asset)));
  if (!$('asset-dialog').open) $('asset-dialog').showModal();
  const version = ++detailVersion;
  if (asset.status === 'pending' || asset.status === 'failed') {
    $('detail-media-message').textContent = asset.status === 'failed' ? (asset.error || '原文件下载失败，未将网页缩略图当作原文件。请回到来源页面重新采集。') : '原文件仍在下载，下载完成后将自动更新。';
    return;
  }
  try {
    const file = await readAssetOriginal(asset, directoryHandle);
    if (version !== detailVersion || detailAssetId !== id) return;
    detailBlob = file; detailURL = URL.createObjectURL(file);
    const media = element(asset.kind === 'video' ? 'video' : 'img');
    if (asset.kind === 'video') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; }
    else media.alt = asset.title || '素材原图';
    media.addEventListener('error', () => { if (version === detailVersion) $('detail-media-message').textContent = '已读取原文件，但浏览器不支持解码此格式。可以导出原文件副本，用系统播放器打开。'; }, { once: true });
    media.src = detailURL; $('detail-media').replaceChildren(media);
    detailViewer.setMedia(media);
    $('detail-save-file').hidden = false;
  } catch (error) {
    if (version !== detailVersion) return;
    $('detail-media').replaceChildren(placeholder(asset, '暂时无法预览原文件'));
    $('detail-media-message').textContent = errorMessage(error);
  }
}
function clearDetailMedia() {
  detailVersion++;
  detailViewer.clear();
  for (const video of $('detail-media').querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
  $('detail-media').replaceChildren();
  if (detailURL) URL.revokeObjectURL(detailURL);
  detailURL = null; detailBlob = null;
}
function closeDetail() { clearDetailMedia(); detailAssetId = null; detailDirty = false; $('asset-dialog').close(); }
async function requestCloseDetail() {
  if (detailSaving) return;
  if (detailDirty && !await askConfirm('放弃未保存的修改？', '当前修改尚未保存。关闭将放弃这些修改。', '放弃修改')) return;
  closeDetail();
}
$('detail-close').addEventListener('click', requestCloseDetail);
$('asset-dialog').addEventListener('cancel', event => { event.preventDefault(); if (!detailViewer.collapse()) requestCloseDetail(); });
$('asset-dialog').addEventListener('click', event => { if (event.target === $('asset-dialog')) requestCloseDetail(); });
$('detail-form').addEventListener('input', () => { detailDirty = true; });
$('detail-form').addEventListener('change', () => { detailDirty = true; });
$('detail-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (detailSaving || !detailAssetId) return;
  const title = $('detail-title').value.trim();
  const folderId = $('detail-folder').value;
  if (!title) { $('detail-title').focus(); return; }
  if (!folderById(folderId)) { $('detail-error').textContent = '请选择一个有效文件夹。'; $('detail-error').hidden = false; return; }
  const notes = $('detail-notes').value.trim();
  const tags = [...new Set($('detail-tags').value.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))];
  if (title.length > 250 || notes.length > 4000 || tags.length > 30 || tags.some(tag => tag.length > 40)) {
    $('detail-error').textContent = '名称最多 250 字，备注最多 4000 字；最多 30 个标签，每个最多 40 字。请缩短后再保存，当前输入未被修改。';
    $('detail-error').hidden = false; return;
  }
  const patch = { title, notes, tags, rating: detailRating, folderId };
  detailSaving = true; $('detail-submit').disabled = true;
  try { await rpc({ type: 'asset.update', id: detailAssetId, patch }); detailDirty = false; closeDetail(); await reloadState(); toast('已保存'); }
  catch (error) { $('detail-error').textContent = errorMessage(error); $('detail-error').hidden = false; }
  finally { detailSaving = false; $('detail-submit').disabled = false; }
});
$('detail-copy-source').addEventListener('click', async () => {
  const value = $('detail-source-url').value;if (!value) return;
  try { await navigator.clipboard.writeText(value); toast('来源链接已复制。'); }
  catch { $('detail-source-url').focus(); $('detail-source-url').select(); toast('请按 Ctrl+C 复制已选中的链接。'); }
});
$('detail-copy-research').addEventListener('click', async () => {
  const input = $('detail-research-text');
  try { await navigator.clipboard.writeText(input.value); toast('已复制广告数据'); }
  catch { input.focus(); input.select(); toast('请按 Ctrl+C 复制已选中的数据'); }
});
function exportResearch(assets) {
  const rows = assets.filter(asset => normalizeResearch(asset.research));
  if (!rows.length) { toast('当前资料没有 BigSpy 数据'); return; }
  downloadBlob(new Blob([researchCSV(rows,folderPath)], {type:'text/csv;charset=utf-8'}), `pikko-bigspy-${new Date().toISOString().slice(0,10)}.csv`);
  toast(`已导出 ${rows.length} 条广告数据`);
}
$('detail-export-research').addEventListener('click', () => exportResearch(state.assets.filter(asset => asset.id === detailAssetId)));
$('export-research').addEventListener('click', () => exportResearch(filteredAssets()));
$('detail-source-note').addEventListener('click', async () => {
  const id = detailAssetId;if (!id) return;
  $('detail-source-note').disabled = true;
  try { await rpc({ type: 'asset.source-note', id }); toast('已开始保存来源说明。'); await reloadState(); }
  catch (error) { toast(errorMessage(error), true); }
  finally { $('detail-source-note').disabled = false; }
});
$('detail-reveal').addEventListener('click', async () => {
  if (!detailAssetId) return;
  try { await rpc({ type: 'asset.reveal', id: detailAssetId }); }
  catch (error) { toast(errorMessage(error), true); }
});
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = element('a'); anchor.href = url; anchor.download = filename; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('detail-save-file').addEventListener('click', () => {
  const asset = state.assets.find(item => item.id === detailAssetId);
  if (!asset || !detailBlob) return;
  const filename = (asset.filename || asset.relativePath?.split(/[\\/]/).at(-1) || detailBlob.name || asset.title || 'original').split(/[\\/]/).at(-1);
  downloadBlob(detailBlob, filename);
});
function askConfirm(title, description, action = '确认删除') {
  if (confirmResolver) return Promise.resolve(false);
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  $('confirm-dialog').querySelector('button[value="confirm"]').textContent = action;
  $('confirm-dialog').returnValue = 'cancel'; $('confirm-dialog').showModal();
  return new Promise(resolve => { confirmResolver = resolve; });
}
$('confirm-dialog').addEventListener('close', () => { const resolve = confirmResolver; confirmResolver = null; resolve?.($('confirm-dialog').returnValue === 'confirm'); });
$('detail-delete').addEventListener('click', async () => {
  const asset = state.assets.find(item => item.id === detailAssetId);
  if (!asset || !await askConfirm('删除这条素材记录？', `「${asset.title || '未命名素材'}」将从索引中移除。\n不会删除硬盘原文件，也不会删除已导入的本地副本。此操作不能撤销。`)) return;
  try { await rpc({ type: 'asset.delete', id: asset.id }); closeDetail(); await reloadState(); toast('素材记录已删除，原文件未受影响。'); }
  catch (error) { toast(errorMessage(error), true); }
});

function openFolderDialog(mode, folder = null) {
  folderMode = { mode, id: mode === 'rename' ? folder.id : null, parentId: mode === 'child' ? folder.id : null };
  $('folder-dialog-title').textContent = mode === 'rename' ? '重命名文件夹' : mode === 'child' ? '新建子文件夹' : '新建文件夹';
  $('folder-name').value = mode === 'rename' ? folder.name : '';
  $('folder-parent-label').textContent = mode === 'child' ? `上级文件夹：${folderPath(folder.id)}` : mode === 'rename' ? '重命名只改变素材分类，不移动或重命名硬盘原文件。' : '新建顶层文件夹。';
  $('folder-submit').textContent = mode === 'rename' ? '保存名称' : '创建文件夹';
  $('folder-error').hidden = true; $('folder-dialog').showModal(); $('folder-name').focus();
}
$('add-root-folder').addEventListener('click', () => openFolderDialog('root'));
$('folder-materialize').addEventListener('click',async()=>{
  const id=view.folderId;if(!id)return;const button=$('folder-materialize');button.disabled=true;
  try{await rpc({type:'folder.materialize',id});await reloadState();toast('本地文件夹已建立。');}catch(error){toast(errorMessage(error),true);}finally{button.disabled=false;}
});
$('folder-rename').addEventListener('click', () => { const folder = folderById(view.folderId); if (folder) openFolderDialog('rename', folder); });
for (const id of ['folder-dialog-close', 'folder-cancel']) $(id).addEventListener('click', () => $('folder-dialog').close());
$('folder-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!folderMode || $('folder-submit').disabled) return;
  const name = $('folder-name').value.trim(); if (!name) { $('folder-name').focus(); return; }
  const operation = folderMode;
  $('folder-submit').disabled = true;
  try {
    const beforeIds = new Set(state.folders.map(folder => folder.id));
    if (operation.mode === 'rename') await rpc({ type: 'folder.rename', id: operation.id, name });
    else await rpc({ type: 'folder.create', name, parentId: operation.parentId });
    if (operation.parentId) expandedFolders.add(operation.parentId);
    if (folderMode === operation) $('folder-dialog').close();
    await reloadState();
    if (operation.mode !== 'rename' && folderMode === operation) { const newFolder = state.folders.find(folder => !beforeIds.has(folder.id) && folder.name === name && (folder.parentId || null) === (operation.parentId || null)); if (newFolder) chooseView('folder', newFolder.id); }
    toast(operation.mode === 'rename' ? '文件夹名称已更新，硬盘目录未改动。' : '本地文件夹已创建。');
  } catch (error) { $('folder-error').textContent = errorMessage(error); $('folder-error').hidden = false; }
  finally { $('folder-submit').disabled = false; }
});
$('folder-delete').addEventListener('click', async () => {
  if (importBusy) { toast('请等待原文件导入完成后，再删除文件夹。'); return; }
  const folder = folderById(view.folderId); if (!folder) return;
  if (state.folders.some(item => item.parentId === folder.id) || state.assets.some(asset => asset.folderId === folder.id)) { toast('只能删除空文件夹。请先移动其中的素材，并删除或整理子文件夹。', true); return; }
  if (!await askConfirm('删除空文件夹？', `将删除「${folder.name}」的分类记录。硬盘上的同名文件夹和文件不会改动。`)) return;
  try { await rpc({ type: 'folder.delete', id: folder.id }); chooseView('all'); await reloadState(); toast('空文件夹记录已删除。'); }
  catch (error) { toast(errorMessage(error), true); }
});

function startImport() {
  if (importBusy) return;
  if (!state.folders.length) { toast('请先创建一个文件夹，再导入原文件。'); openFolderDialog('root'); return; }
  importFolderId = folderById(view.folderId)?.id || null;
  if (!importFolderId) {
    fillFolderSelect($('import-folder'), null);
    $('import-dialog').showModal(); $('import-folder').focus();
    return;
  }
  $('import-input').click();
}
for (const id of ['import-close', 'import-cancel']) $(id).addEventListener('click', () => $('import-dialog').close());
$('import-form').addEventListener('submit', event => {
  event.preventDefault();
  const id = $('import-folder').value;
  if (!folderById(id)) { $('import-folder').focus(); return; }
  importFolderId = id; $('import-dialog').close(); $('import-input').click();
});
$('import-button').addEventListener('click', startImport);
$('empty-import').addEventListener('click', startImport);
$('import-input').addEventListener('change', async event => {
  const files = [...event.target.files]; event.target.value = ''; if (!files.length || importBusy) return;
  const folderId = importFolderId; importFolderId = null;
  if (!folderById(folderId)) { toast('请选择存放文件夹，再重新选择文件。', true); return; }
  importBusy = true; $('import-button').disabled = true; $('empty-import').disabled = true;
  let success = 0; const failures = [];
  for (const [index, file] of files.entries()) {
    $('import-button').textContent = `正在导入 ${index + 1}/${files.length}`;
    let blobId, localURL;
    let bytesSaved = false;
    try {
      const kind = IMPORT_TYPES.get(file.type.toLowerCase());
      if (!kind) throw new Error('支持 JPEG、PNG、GIF、WebP、AVIF、MP4、WebM、MOV 和 M4V 原文件。不接受 SVG、HTML 或未知类型。');
      await validateImportedOriginal(file);
      blobId = crypto.randomUUID();
      await saveOriginal(blobId, file); bytesSaved = true;
      // Original bytes must commit before the metadata record becomes visible.
      localURL=URL.createObjectURL(file);
      const saved=await rpc({ type: 'asset.import', asset: {localURL, title: file.name, filename: file.name, kind, mime: file.type, size: file.size, blobId, folderId, rating: 0, tags: [] } });
      if(saved.asset?.relativePath&&!saved.asset.blobId)await rollbackOriginal(blobId).catch(()=>{});
      success++;
    } catch (error) {
      failures.push(`${file.name}：${errorMessage(error)}`);
      // Transport failures have uncertain outcomes: preserve those original bytes.
      // Only a definite rejection plus an unreferenced state permits rollback.
      if (bytesSaved && blobId && error.definitiveRejection) {
        try { const response = await rpc({ type: 'state' }); const latest = response.state || response.data || response; if (Array.isArray(latest.assets) && !latest.assets.some(asset => asset.blobId === blobId)) await rollbackOriginal(blobId); } catch {}
      }
    } finally {if(localURL)URL.revokeObjectURL(localURL);}
  }
  importBusy = false; $('import-button').disabled = false; $('empty-import').disabled = false; $('import-button').textContent = '＋ 导入原文件';
  await reloadState();
  if (failures.length) { $('load-error').textContent = `${success} 个导入成功，${failures.length} 个失败。${failures.slice(0, 5).join('；')}`; $('load-error').hidden = false; }
  toast(success ? `已导入 ${success} 个原文件副本到「${folderPath(folderId)}」。${failures.length ? `另有 ${failures.length} 个失败。` : ''}` : '文件未导入，请查看错误说明。', !success);
});

$('clear-library').addEventListener('click', async () => {
  if (importBusy) { toast('请等待原文件导入完成后，再清空素材记录。'); return; }
  if (!state.assets.length) { toast('素材库已经没有素材记录。'); return; }
  if (!await askConfirm('清空整个素材索引？', `将清空 ${state.assets.length} 条素材记录，保留文件夹分类。\n这不会删除硬盘原文件，也不会删除本地库副本，但记录无法自动恢复。建议先导出素材索引。此操作不能撤销。`, '清空记录')) return;
  try { await rpc({ type: 'library.clear' }); closeDetail(); chooseView('all'); await reloadState(); toast('素材索引已清空，没有删除任何原文件。'); }
  catch (error) { toast(errorMessage(error), true); }
});
$('export').addEventListener('click', () => {
  const metadata = { application: 'pikko.', version: 2, exportedAt: new Date().toISOString(), description: '素材索引备份，不包含原文件字节、目录授权或本地库副本。此版本不支持导入索引自动恢复。', folders: state.folders, assets: state.assets };
  downloadBlob(new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }), `pikko-index-${new Date().toISOString().slice(0, 10)}.json`);
  toast('已导出素材索引。备份不包含原文件，也不包含本地库副本。');
});
$('refresh').addEventListener('click', async () => { directoryAccess = await directoryPermission(directoryHandle); renderDirectoryStatus(); await reloadState(); render(); });
for (const button of $('main-nav').querySelectorAll('[data-view]')) button.addEventListener('click', () => chooseView(button.dataset.view));
let searchTimer;
$('search').addEventListener('input', event => { view.search = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(render, 140); });
for (const [id, field] of [['type-filter', 'kind'], ['platform-filter', 'platform'], ['rating-filter', 'rating'], ['sort', 'sort']]) $(id).addEventListener('change', event => { view[field] = field === 'rating' ? Number(event.target.value) : event.target.value; render(); });
$('include-descendants').addEventListener('change', event => { view.descendants = event.target.checked; render(); });
$('reset-filters').addEventListener('click', () => { view.search = ''; view.kind = 'all'; view.platform = 'all'; view.rating = 0; $('search').value = ''; $('type-filter').value = 'all'; $('platform-filter').value = 'all'; $('rating-filter').value = '0'; view.year='all';view.startMonth=1;view.endMonth=12;render(); });
for(const button of document.querySelectorAll('[data-layout]'))button.addEventListener('click',()=>{view.layout=button.dataset.layout;saveViewPreferences();render();animateSurface(view.layout==='overview'?$('month-overview'):$('asset-grid'),[{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'none'}]);});
$('breadcrumb-home').addEventListener('click',()=>chooseView('all'));
$('new-folder').addEventListener('click',()=>{const f=folderById(view.folderId);openFolderDialog(f?'child':'root',f);});
$('directory-toggle').addEventListener('click',()=>{$('directory-panel').hidden=!$('directory-panel').hidden;$('directory-toggle').setAttribute('aria-expanded',String(!$('directory-panel').hidden));});
for(const [id,key] of [['period-year','year'],['period-start','startMonth'],['period-end','endMonth'],['period-source','periodSource']])$(id).addEventListener('change',event=>{
  view[key]=id==='period-start'||id==='period-end'?Number(event.target.value):event.target.value;
  if(view.startMonth>view.endMonth){if(key==='startMonth')view.endMonth=view.startMonth;else view.startMonth=view.endMonth;}render();
});
$('period-all').addEventListener('click',()=>{view.year='all';view.startMonth=1;view.endMonth=12;render();});
$('sort').addEventListener('change',saveViewPreferences);
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); } });
let storageReloadTimer;
if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((_changes, areaName) => { if (areaName !== 'local') return; clearTimeout(storageReloadTimer); storageReloadTimer = setTimeout(reloadState, 160); });
window.addEventListener('pagehide', () => { clearGridMedia(); clearDetailMedia(); });
window.addEventListener('pageshow', event => { if (event.persisted) { render(); if (detailAssetId) openDetail(detailAssetId); } });
renderDirectoryStatus();
await Promise.all([reloadState(), initializeDirectory()]);
