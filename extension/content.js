/* pikko. v0.2.1 · page corner capture. Preview media is never downloaded or persisted here. */
(() => {
  'use strict';
  if (globalThis.__pikkoCaptureControl || !globalThis.AdVaultBigSpyAdapter) return;
  for (const previous of document.querySelectorAll('#ad-vault-v2-capture-root')) {
    previous.style.setProperty('display', 'none', 'important');
    previous.removeAttribute('id');
    previous.remove();
  }
  globalThis.__adVaultCaptureV2 = true;
  const adapter = globalThis.AdVaultBigSpyAdapter;
  window.addEventListener('pikko-official-download-denied',event=>{
    const data=event.detail;
    if(!data||!['official-count-limit','official-denied'].includes(data.reason)||typeof data.assetId!=='string')return;
    message({type:'capture.blocked',assetId:data.assetId,reason:data.reason,responseAt:data.responseAt}).catch(()=>{});
  });
  window.addEventListener('pikko-official-download-response',event=>{const d=event.detail;if(d?.status===200&&typeof d.assetId==='string')message({type:'capture.response',assetId:d.assetId,status:200,responseAt:d.responseAt}).catch(()=>{});});
  const host = document.createElement('div');
  host.id = 'ad-vault-v2-capture-root';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483646!important;pointer-events:none!important;color-scheme:light!important;';
  const shadow = host.attachShadow({mode: 'closed'});
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 13px; line-height: 1.5; color: #2a2420; color-scheme: light; }
    *, *::before, *::after { box-sizing: border-box; }
    button, input, textarea, select { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: wait; opacity: .48; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid #c6803f; outline-offset: 2px; }
    .av-badge { position: fixed; pointer-events: auto; display: flex; align-items: center; gap: 5px; height: 29px; padding: 0 10px 0 8px; border: 1px solid rgba(255,255,255,.7); border-radius: 8px; background: #2a2420; box-shadow: 0 2px 10px #24124735; color: #fff; font-weight: 650; font-size: 12px; line-height: 1; transition: background .15s, transform .15s; }
    .av-badge:hover { background: #5a402a; transform: translateY(-1px); }
    .av-badge-mark { font-size: 16px; }
    .av-backdrop { pointer-events: auto; position: fixed; inset: 0; display: flex; justify-content: center; align-items: center; padding: 24px; background: #21180f99; backdrop-filter: blur(2px); }
    .av-dialog { width: 780px; max-width: calc(100% - 24px); height: min(660px, calc(100dvh - 64px)); display: grid; grid-template-columns: 320px minmax(0,1fr); background: #f3eadc; border-radius: 6px 12px 6px 6px; overflow: visible; position: relative; box-shadow: 0 22px 85px #16102445; border: 1px solid #ffffff70; animation: av-enter .16s ease-out; }
    @keyframes av-enter { from { transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .av-left { padding: 21px 23px 19px; min-height: 0; overflow-y: auto; background: #2a2420; border-right: 1px solid #d9c9b8; }
    .av-brand { display: flex; align-items: center; gap: 8px; margin-bottom: 17px; font-size: 14px; letter-spacing: -.2px; font-weight: 750; }
    .av-brand-icon { width: 25px; height: 25px; border-radius: 4px; display: grid; place-items: center; color: #fff; background: #c6803f; font-size: 19px; }
    .av-brand small { margin-left: auto; font-size: 10px; font-weight: 600; color: #aa9278; letter-spacing: 1px; }
    .av-preview { position: relative; height: clamp(140px, calc(100dvh - 430px), 250px); background: #211d19; border-radius: 3px; overflow: hidden; display: grid; place-items: center; }
    .av-preview img, .av-preview video { display: block; max-width: 100%; max-height: clamp(140px, calc(100dvh - 430px), 250px); object-fit: contain; width: auto; height: auto; }
    .av-preview-empty { padding: 24px; color: #b5a08a; text-align: center; }
    .av-kind { position: absolute; top: 9px; left: 9px; padding: 2px 7px; border-radius: 5px; background: #2a2420d9; color: white; font-size: 10px; pointer-events: none; }
    .av-preview-note { color: #b6a087; font-size: 10px; text-align: center; margin: 7px 0 9px; }
    .av-stars { display: flex; justify-content: center; gap: 4px; margin-bottom: 13px; }
    .av-star { padding: 0 2px; border: 0; background: none; font-size: 25px; line-height: 1.2; color: #796751; transition: color .12s, transform .12s; }
    .av-star[aria-pressed="true"] { color: #d69a58; }
    .av-star:hover { transform: translateY(-2px); }
    .av-input, .av-textarea, .av-select { display: block; width: 100%; border: 1px solid #d7c3aa; border-radius: 4px; background: #fff; color: #2a2420; padding: 9px 10px; line-height: 1.4; }
    .av-input::placeholder, .av-textarea::placeholder { color: #9b8974; }
    .av-textarea { resize: vertical; min-height: 57px; max-height: 120px; }
    .av-field { display: block; margin-bottom: 10px; }
    .av-field-label { display: block; color: #bba58b; font-size: 10px; margin-bottom: 4px; }
    .av-tags-wrap { position: relative; }
    .av-tags-wrap .av-input { padding-left: 28px; }
    .av-tags-icon { position: absolute; top: 8px; left: 10px; color: #967d60; }
    .av-consent { display: flex; align-items: flex-start; gap: 7px; color: #b19b82; font-size: 10px; line-height: 1.6; margin: 15px 0 0; padding-top: 12px; border-top: 1px solid #594737; }
    .av-consent input { flex: none; margin: 2px 0 0; accent-color: #c6803f; }
    .av-right { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    .av-right-head { display: flex; align-items: flex-start; padding: 23px 22px 16px; gap: 8px; }
    .av-right-head h2 { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -.4px; }
    .av-subtitle { margin: 4px 0 0; color: #978068; font-size: 11px; }
    .av-close { position: relative; margin-left: auto; width: 36px; height: 36px; flex: none; padding: 0; border: 0; border-radius: 50%; background: #e5dacb; color: #59483a; }
    .av-close::before,.av-close::after { content: ''; position: absolute; left: 50%; top: 50%; width: 16px; height: 2px; border-radius: 1px; background: currentColor; transform: translate(-50%,-50%) rotate(45deg); }
    .av-close::after { transform: translate(-50%,-50%) rotate(-45deg); }
    .av-close:hover { color: #5e4128; background: #e5d2b9; }
    .av-search-wrap { position: relative; margin: 0 22px 16px; }
    .av-search-wrap .av-input { padding-left: 31px; background: #fcf8f1; border-color: #d9c9b8; font-size: 12px; }
    .av-search-icon { position: absolute; left: 11px; top: 7px; color: #9d94ac; font-size: 18px; line-height: 1.3; }
    .av-tree-header { padding: 0 24px 7px; display: flex; align-items:center; justify-content: space-between; color: #8b7966; font-size: 11px; }
    .av-folder-list { flex: 1; overflow: auto; min-height: 80px; padding: 0 14px 16px; }
    .av-folder-row { display: flex; align-items: center; min-width: 0; min-height: 41px; border-radius: 4px; margin: 2px 0; }
    .av-folder-row:hover { background: #e6d2b6; }
    .av-folder-row:focus-within { background: #e6d2b6; }
    .av-expand { width: 30px; height: 30px; flex: none; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: #725235; padding: 0; margin-right: 3px; }
    .av-expand::before { content: ''; width: 7px; height: 7px; border-top: 2px solid currentColor; border-right: 2px solid currentColor; transform: rotate(45deg); margin-left: -3px; }
    .av-expand[aria-expanded="true"]::before { transform: rotate(135deg); margin: -3px 0 0; }
    .av-expand:hover { background: #d9bf9d; border-color: #a88051; }
    .av-expand-empty { width: 33px; flex: none; }
    .av-folder-button { flex: 1; display: flex; align-items: center; min-width: 0; gap: 9px; padding: 10px 12px 10px 0; border: none; border-radius: 6px; text-align: left; background: transparent; color: #59432c; line-height: 1.3; font-size: 13px; }
    .av-folder-symbol { width: 18px; height: 13px; flex: none; position: relative; border: 1.2px solid #b18552; border-radius: 2px; margin-top: 2px; }
    .av-folder-symbol::before { content: ''; position: absolute; left: -1.2px; top: -5px; width: 8px; height: 4px; border: 1.2px solid #b18552; border-bottom: 0; border-radius: 2px 3px 0 0; }
    .av-folder-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .av-folder-count { color: #9c8469; margin-left: auto; padding-left: 5px; font-size: 11px; }
    .av-folder-row.selected { background: #e5cbaa; box-shadow: inset 3px 0 #a8672e; }
    .av-folder-button[aria-pressed="true"] .av-folder-name { font-weight: 600; color: #35271b; }
    .av-empty { color: #a18b71; text-align: center; margin: 42px 15px; font-size: 12px; line-height: 1.8; }
    .av-error { color: #a04b2d; background: #fae8de; border: 1px solid #e7bdab; padding: 11px 12px; border-radius: 4px; font-size: 11px; margin: 0 22px 12px; line-height: 1.7; }
    .av-error:empty { display: none; }
    .av-bottom { padding: 13px 22px 18px; border-top: 1px solid #dfc9ac; display: grid; gap: 12px; }
    .av-save-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .av-destination { flex: 1; min-width: 0; color: #725b43; font-size: 12px; line-height: 1.5; }
    .av-destination strong,.av-destination span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .av-destination strong { color: #3e2d1f; font-weight: 600; }
    .av-save { min-width: 92px; min-height: 40px; padding: 10px 20px; border: 1px solid #2a2420; border-radius: 5px; background: #2a2420; color: #faf7f1; font-size: 14px; font-weight: 600; }
    .av-save:hover { background: #51402f; }
    .av-recent { width: 100%; display: flex; align-items: center; gap: 14px; text-align: left; border: 0; border-left: 2px solid transparent; border-radius: 0; background: transparent; padding: 7px 10px; color: #5f4933; }
    .av-recent { border-left-color: #b8783d; background: #e9ddcd80; }
    .av-recent:hover { background: #e4d4bf; }
    .av-recent-label { flex:none; font-size: 11px; color: #8a7662; }
    .av-recent-action { font-size: 12px; font-weight: 600; color: #8b592f; }
    .av-new-folder { width: auto; padding: 7px 0 7px 12px; text-align: left; background: transparent; border: 0; border-radius: 4px; color: #86603c; font-size: 12px; }
    .av-new-folder:hover { border-color: #b98a52; color: #c6803f; background: #ecdbc4; }
    .av-create-form { display: grid; gap: 8px; }
    .av-create-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .av-small-button { border: 1px solid #d8bea0; border-radius: 6px; padding: 6px 12px; background: white; color: #917454; font-size: 11px; }
    .av-small-button.av-primary { border-color: #c6803f; background: #c6803f; color: white; }
    .av-footnote { color: #aa947a; font-size: 10px; margin: 11px 0 0; text-align: center; }
    .av-toasts { position: fixed; right: 24px; bottom: 24px; width: min(380px, calc(100vw - 40px)); display: flex; flex-direction: column; gap: 8px; }
    .av-toast { pointer-events: auto; padding: 14px 17px; display: flex; gap: 9px; align-items: flex-start; border: 1px solid #ddc7aa; border-radius: 10px; color: #654c32; background: white; box-shadow: 0 6px 30px #34204725; font-size: 12px; line-height: 1.7; }
    .av-toast-symbol { color: #bd7d3f; flex: none; }
    .av-toast-error { border-color: #e3b5a1; color: #9b4d30; }
    [hidden] { display: none !important; }
    @media (max-width: 620px) { .av-backdrop { padding: 12px; } .av-dialog { grid-template-columns: minmax(200px,.9fr) minmax(210px,1.1fr); height: calc(100dvh - 24px); } .av-left { padding: 18px 15px; } .av-preview { height: 150px; } .av-preview img, .av-preview video { max-height: 150px; } .av-right-head { padding: 20px 15px 13px; } .av-search-wrap { margin: 0 15px 12px; } .av-bottom { padding: 12px 14px; } .av-error { margin: 0 14px 12px; } }
    @media (max-width: 440px) { .av-dialog { display: flex; flex-direction: column; overflow-y: auto; } .av-left { flex: none; overflow: visible; padding: 14px 18px; } .av-preview { height: 125px; } .av-preview img, .av-preview video { max-height: 125px; } .av-right { min-height: 340px; flex: 1 0 340px; } .av-left .av-brand { margin-bottom: 10px; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  
    .av-dialog,.av-badge,.av-toasts { font-family: "Segoe UI","Microsoft YaHei",sans-serif; font-size: 13px; line-height: 1.5; }
    .av-dialog::before { content: ''; position: absolute; left: 320px; top: -28px; width: 145px; height: 29px; border-radius: 6px 14px 0 0; background: #f3eadc; }
    .av-dialog::after { content: ''; position: absolute; right: -12px; top: 14px; bottom: 8px; width: 8px; background: #bc9366; border-radius: 3px 5px 0 0; box-shadow: 6px 7px #8e663f; }
    .av-left { color: #eee2d2; border-radius: 7px 0 0 7px; }
    .av-left input,.av-left textarea,.av-left select { background: #332c26; color: #f5ecdf; border-color:#584b3f; }
    .av-left input::placeholder,.av-left textarea::placeholder { color:#b7a591; }
    .av-left .av-field:first-of-type .av-input { font-size:14px; }
    .av-brand { font-size: 24px; font-weight: 400; letter-spacing: -1px; }
    .av-brand-icon { background: #2a2420 url('${chrome.runtime.getURL?.('assets/logo-board.png')||''}') -203.6px -195.1px / 319.56px auto no-repeat; font-size: 0; width: 30px; height: 31px; }
    .av-folder-symbol { background: #d9c9b830; }
    .av-right-head h2 { font-size: 18px; font-weight: 550; }
    .av-folder-row { border-radius: 3px; }
    .av-small-button.av-primary { background: #2a2420; border-color: #2a2420; }
    .av-score-label { display:block;text-align:center;color:#c5ae91;font-size:11px;margin:5px 0; }
    .av-star { color:#bba58a; }
    .av-dialog [hidden] { display: none !important; }
    .av-research { margin:12px 0; font-size:12px; }
    .av-research summary { cursor:pointer; color:#d9b88e; padding:7px 0; }
    .av-research .av-small-button { margin:4px 0 8px; }
    .av-research textarea { width:100%; min-height:140px; white-space:pre-wrap; font-size:11px; line-height:1.7; }
    .av-dialog .av-input:focus,.av-dialog .av-textarea:focus,.av-dialog .av-select:focus { outline: 2px solid #c6803f; }
    @media (max-width: 680px) { .av-dialog::before { left: 14px; } }
`;
  const badges = document.createElement('div');
  const toasts = document.createElement('div');
  toasts.className = 'av-toasts';
  toasts.setAttribute('aria-live', 'polite');
  shadow.append(style, badges, toasts);

  const mediaButtons = new Map();
  const pendingAssets = new Map();
  let modal = null;
  let scanTimer = null;
  let lastScan = 0;
  let disposed = false;
  let captureEnabled = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(className, text, onClick) {
    const node = element('button', className, text);
    node.type = 'button';
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }
  function message(payload) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => { if (!finished) { finished = true; reject(new Error('扩展没有及时响应。请到素材库检查状态后重试。')); } }, 12000);
      try {
        chrome.runtime.sendMessage(payload, response => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message || '扩展连接已断开，请刷新页面。'));
          else if (response?.ok === false || response?.error) reject(new Error(response.error || response.message || '操作未完成，请重试。'));
          else resolve(response);
        });
      } catch (error) { finished = true; clearTimeout(timer); reject(error); }
    });
  }
  function toast(text, error = false, duration = 6500) {
    const node = element('div', `av-toast${error ? ' av-toast-error' : ''}`);
    node.setAttribute('role', error ? 'alert' : 'status');
    node.append(element('span', 'av-toast-symbol', error ? '!' : '✦'), element('span', '', text));
    toasts.append(node);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
    setTimeout(() => node.remove(), duration);
  }
  function setError(view, text) {
    if (view.closed) return;
    view.error.textContent = text || '';
  }
  function setBusy(view, busy) {
    view.busy = busy;
    view.dialog.setAttribute('aria-busy', String(busy));
    for (const control of view.dialog.querySelectorAll('input, textarea, select, button')) {
      if (control !== view.closeButton) control.disabled = busy;
    }
    if (view.saveButton) updateSaveDestination(view);
  }

  function closePicker(view = modal) {
    if (!view || view.closed) return;
    view.closed = true;
    view.backdrop.remove();
    if (host.parentElement !== document.documentElement) document.documentElement.append(host);
    document.removeEventListener('keydown', view.keyListener, true);
    if (modal === view) modal = null;
    scheduleScan();
    if (view.assetId && !view.triggered) message({type: 'capture.cancel', assetId: view.assetId}).catch(() => {});
    view.preview?.pause?.();
    if (!view.triggered) view.returnToListing?.();
    if (view.returnFocus?.isConnected) view.returnFocus.focus({preventScroll: true});
  }

  function field(text, control) {
    const label = element('label', 'av-field');
    if (text) label.append(element('span', 'av-field-label', text));
    label.append(control);
    return label;
  }
  function input(placeholder, value = '') {
    const node = element('input', 'av-input');
    node.type = 'text';
    node.placeholder = placeholder;
    node.value = value;
    return node;
  }

  function openPicker(media, returnFocus, returnToListing = null) {
    if (!captureEnabled || disposed) return;
    if (modal) closePicker();
    if (!adapter.eligibleMedia(media)) return toast('该素材已不在当前页面中，请重新选择。', true);
    const capture = adapter.snapshot(media);
    // Keep the shadow host inside an existing site's modal focus scope.
    // Otherwise its focus trap sees our editable fields as outside the dialog.
    const pageDialog = media.closest('[role="dialog"], dialog');
    (pageDialog?.querySelector('.ant-modal-content') || pageDialog || document.documentElement).append(host);
    const backdrop = element('div', 'av-backdrop');
    const dialog = element('section', 'av-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '收藏素材到 pikko.');
    const view = {capture, backdrop, dialog, returnFocus, returnToListing, rating: 0, folders: [], assets: [], collapsed: new Set(), initializedFolders: new Set(), selectedFolderId: null, selectionInitialized: false, busy: false, closed: false, triggered: false};
    modal = view;
    backdrop.append(dialog);
    const left = element('div', 'av-left');
    const right = element('div', 'av-right');
    dialog.append(left, right);
    const brand = element('div', 'av-brand');
    brand.append(element('span', 'av-brand-icon', ''), element('span', '', 'pikko.'));
    left.append(brand);
    const previewBox = element('div', 'av-preview');
    // Existing page URLs are used only for this transient preview, never sent to background or saved.
    const videoPreview = capture.kind === 'video' && capture.source;
    const previewSource = videoPreview || capture.poster || capture.source;
    if (previewSource) {
      view.preview = element(videoPreview ? 'video' : 'img');
      view.preview.alt = capture.kind === 'video' ? '视频封面' : '素材预览';
      if (videoPreview) {
        view.preview.controls = true;
        view.preview.muted = true;
        view.preview.preload = 'metadata';
        view.preview.poster = capture.poster || '';
        view.preview.addEventListener('loadedmetadata', () => {
          if (!view.closed && Number.isFinite(view.preview.duration)) view.preview.currentTime = Math.min(media.currentTime || 0.1, Math.max(0, view.preview.duration - 0.1));
        }, {once: true});
      }
      view.preview.src = previewSource;
      view.preview.addEventListener('error', () => {
        if (view.closed) return;
        view.preview.remove();
        previewBox.prepend(element('span', 'av-preview-empty', '暂无预览'));
      }, {once: true});
      previewBox.append(view.preview);
    } else previewBox.append(element('span', 'av-preview-empty', '暂无预览'));
    const previewBadge = element('span', 'av-kind', capture.kind === 'video' ? '视频' : '图片');
    previewBox.append(previewBadge);
    left.append(previewBox);
    const stars = element('div', 'av-stars');
    stars.setAttribute('role', 'group');
    stars.setAttribute('aria-label', '素材评分，点击已选星级可清除');
    for (let n = 1; n <= 5; n++) {
      const star = button('av-star', '☆', () => {
        view.rating = view.rating === n ? 0 : n;
        for (const [index, item] of [...stars.children].entries()) {item.setAttribute('aria-pressed', String(index < view.rating));item.textContent=index<view.rating?'★':'☆';}
      });
      star.setAttribute('aria-label', `${n} 星`);
      star.setAttribute('aria-pressed', 'false');
      stars.append(star);
    }
    left.append(stars);
    const research = capture.research;
    view.title = input('素材名称', (research?.headline ? [research.advertiser,research.headline].filter(Boolean).join(' · ') : media.getAttribute('alt') || '').trim().slice(0, 180));
    view.title.maxLength = 180;
    view.title.setAttribute('aria-label', '素材标题');
    view.notes = element('textarea', 'av-textarea');
    view.notes.placeholder = '备注';
    view.notes.maxLength = 4000;
    view.notes.setAttribute('aria-label', '素材备注');
    view.tags = input('标签');
    view.tags.maxLength = 600;
    view.tags.setAttribute('aria-label', '标签，用逗号分隔');
    const tagsWrap = element('div', 'av-tags-wrap');
    tagsWrap.append(element('span', 'av-tags-icon', '⌗'), view.tags);
    left.append(field('', view.title), field('', view.notes), field('', tagsWrap));
    if (research) {
      const details = element('details', 'av-research');
      const summary = element('summary', '', `BigSpy${research.runningDays !== undefined ? ` · ${research.runningDays} 天` : ''}`);
      const copyData = button('av-small-button', '复制广告数据', async () => {
        try { await loadResearch(); await navigator.clipboard.writeText(dataText.value); toast('已复制广告数据'); }
        catch (error) { if (!dataText.value) { toast(error.message || '未能读取广告数据',true); return; } dataText.focus(); dataText.select(); toast('请按 Ctrl+C 复制已选中的数据'); }
      });
      const dataText = element('textarea', 'av-textarea'); dataText.readOnly = true; dataText.rows = 7; dataText.setAttribute('aria-label','BigSpy 广告数据');
      async function loadResearch() {
        if (dataText.value) return;
        const response = await message({type:'research.format',data:research}); dataText.value = response.text || '';
        if (!dataText.value) throw new Error('未能读取广告数据');
      }
      details.addEventListener('toggle', () => { if (details.open) loadResearch().catch(error=>toast(error.message,true)); });
      details.append(summary,copyData,dataText); left.append(details);
    }
    const consent = element('label', 'av-consent');
    view.allowMissingReferrer = document.createElement('input');
    view.allowMissingReferrer.type = 'checkbox';
    view.allowMissingReferrer.checked = false;
    consent.append(view.allowMissingReferrer, element('span', '', '允许本次接收无来源下载'));
    consent.title = '可能接收到其他标签页的下载，请先暂停其他下载。';
    if (capture.mode === 'native' && !research) left.append(consent);

    const head = element('div', 'av-right-head');
    const heading = element('div');
    heading.append(element('h2', '', '收藏到文件夹'));
    view.closeButton = button('av-close', '', () => closePicker(view));
    view.closeButton.setAttribute('aria-label', '关闭收藏窗口');
    head.append(heading, view.closeButton);
    right.append(head);
    const searchWrap = element('div', 'av-search-wrap');
    view.search = input('搜索文件夹…');
    view.search.setAttribute('aria-label', '搜索文件夹');
    view.search.addEventListener('input', () => renderFolders(view));
    searchWrap.append(element('span', 'av-search-icon', '⌕'), view.search);
    view.recentFolder = element('div', 'av-search-wrap');
    const treeHeader = element('div', 'av-tree-header');
    view.createArea = element('div');
    treeHeader.append(element('span', '', '文件夹'), view.createArea);
    view.folderList = element('div', 'av-folder-list');
    view.folderList.setAttribute('aria-label', '选择目标文件夹');
    view.folderList.append(element('div', 'av-empty', '正在读取你的文件夹…'));
    view.error = element('div', 'av-error');
    view.error.setAttribute('role', 'alert');
    right.append(view.recentFolder, searchWrap, treeHeader, view.folderList, view.error);
    view.bottom = element('div', 'av-bottom');
    const saveRow = element('div', 'av-save-row');
    view.destination = element('div', 'av-destination');
    view.destination.setAttribute('role', 'status');
    view.saveButton = button('av-save', '保存', () => saveSelection(view));
    view.saveButton.disabled = true;
    saveRow.append(view.destination, view.saveButton);
    view.bottom.append(saveRow);
    right.append(view.bottom);
    renderCreateButton(view);
    view.keyListener = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(view); return; }
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary')].filter(node => node.getClientRects().length && !node.closest('[hidden]'));
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1]; const active = shadow.activeElement;
        if (event.shiftKey && (active === first || !dialog.contains(active))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (active === last || !dialog.contains(active))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', view.keyListener, true);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closePicker(view); });
    // Stop page-level click shortcuts from treating picker controls as card clicks.
    dialog.addEventListener('click', event => event.stopPropagation());
    for (const type of ['keydown', 'keyup', 'keypress', 'input', 'beforeinput']) dialog.addEventListener(type, event => event.stopPropagation());
    shadow.append(backdrop);
    for (const badge of mediaButtons.values()) badge.hidden = true;
    view.search.focus({preventScroll: true});
    loadState(view);
  }

  async function loadState(view) {
    try {
      const response = await message({type: 'state'});
      if (view.closed) return;
      const state = response?.state || response;
      if (!Array.isArray(state?.folders)) throw new Error('文件夹数据暂不可用，请关闭窗口后重试。');
      view.folders = state.folders.filter(folder => folder && typeof folder.id === 'string' && typeof folder.name === 'string');
      view.assets = Array.isArray(state.assets) ? state.assets : [];
      view.lastFolderId = state.settings?.lastFolderId || null;
      for (const folder of view.folders) if (!view.initializedFolders.has(folder.id)) { view.initializedFolders.add(folder.id); view.collapsed.add(folder.id); }
      if (!view.selectionInitialized) { view.selectedFolderId = view.folders.some(folder => folder.id === view.lastFolderId) ? view.lastFolderId : null; view.selectionInitialized = true; }
      renderFolders(view);
    } catch (error) {
      if (view.closed) return;
      view.folderList.replaceChildren(element('div', 'av-empty', '未能读取文件夹'));
      setError(view, error.message);
    }
  }

  function renderFolders(view) {
    if (view.closed) return;
    const query = view.search.value.trim().toLocaleLowerCase();
    view.recentFolder.replaceChildren();
    const lastFolder = view.folders.find(folder => folder.id === view.lastFolderId);
    if (lastFolder && !query) {
      const recent = button('av-recent', undefined, () => { selectFolder(view, lastFolder); chooseFolder(view, lastFolder); });
      recent.disabled = view.busy;
      recent.setAttribute('aria-label', `保存到上次使用的文件夹 ${folderFullPath(view,lastFolder)}`);
      recent.title = '直接保存到此文件夹';
      const copy = element('span', 'av-destination');
      appendFolderLabel(copy, view, lastFolder);
      recent.append(element('span', 'av-recent-label', '上次使用'), copy, element('span', 'av-recent-action', '保存'));
      view.recentFolder.append(recent);
    }
    view.recentFolder.hidden = !view.recentFolder.childElementCount;
    updateSaveDestination(view);
    const folderIds = new Set(view.folders.map(folder => folder.id));
    const byId = new Map(view.folders.map(folder => [folder.id, folder]));
    const counts = new Map();
    for (const asset of view.assets) {
      let folder = byId.get(asset?.folderId);
      const seen = new Set();
      while (folder && !seen.has(folder.id)) {
        seen.add(folder.id);
        counts.set(folder.id, (counts.get(folder.id) || 0) + 1);
        folder = byId.get(folder.parentId);
      }
    }
    const children = new Map();
    for (const folder of view.folders) {
      const key = folder.parentId && folderIds.has(folder.parentId) && folder.parentId !== folder.id ? folder.parentId : null;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(folder);
    }
    const included = new Set();
    if (query) {
      for (const folder of view.folders) if (folder.name.toLocaleLowerCase().includes(query)) {
        let item = folder;
        const seen = new Set();
        while (item && !seen.has(item.id)) { included.add(item.id); seen.add(item.id); item = byId.get(item.parentId); }
        const pending = [folder.id], descendants = new Set();
        while (pending.length) {
          const id = pending.pop();
          if (descendants.has(id)) continue;
          descendants.add(id); included.add(id);
          for (const child of children.get(id) || []) pending.push(child.id);
        }
      }
    }
    view.folderList.replaceChildren();
    let shown = 0;
    for(const list of children.values())list.sort((a,b)=>{const date=/^(?:20\d{2}[-年.]?)?(?:0?[1-9]|1[0-2])月?$|^20\d{2}年?$/;return date.test(a.name)&&date.test(b.name)?b.name.localeCompare(a.name,'zh-CN',{numeric:true}):0;});
    const visited = new Set();
    function visit(folder, depth) {
      if (visited.has(folder.id) || depth > 20 || (query && !included.has(folder.id))) return;
      visited.add(folder.id);
      shown++;
      const kids = children.get(folder.id) || [];
      const row = element('div', `av-folder-row${folder.id === view.selectedFolderId ? ' selected' : ''}`);
      row.style.paddingLeft = `${Math.min(depth, 8) * 16}px`;
      if (kids.length) {
        const expanded = Boolean(query) || !view.collapsed.has(folder.id);
        const expand = button('av-expand', '', () => {
          if (view.collapsed.has(folder.id)) view.collapsed.delete(folder.id); else view.collapsed.add(folder.id);
          renderFolders(view);
        });
        expand.setAttribute('aria-label', `${expanded ? '收起' : '展开'} ${folder.name}`);
        expand.setAttribute('aria-expanded', String(expanded));
        expand.disabled = view.busy;
        row.append(expand);
      } else row.append(element('span', 'av-expand-empty'));
      const choose = button('av-folder-button', undefined, () => selectFolder(view, folder));
      choose.dataset.folderId = folder.id;
      choose.title = '单击选择，双击保存';
      choose.addEventListener('dblclick', () => chooseFolder(view, folder));
      choose.disabled = view.busy;
      choose.setAttribute('aria-label', `选择文件夹 ${folderFullPath(view,folder)}`);
      choose.setAttribute('aria-pressed', String(folder.id === view.selectedFolderId));
      choose.append(element('span', 'av-folder-symbol'), element('span', 'av-folder-name', folder.name), element('span', 'av-folder-count', String(counts.get(folder.id) || 0)));
      row.append(choose);
      view.folderList.append(row);
      if (query || !view.collapsed.has(folder.id)) for (const child of kids) visit(child, depth + 1);
    }
    for (const root of children.get(null) || []) visit(root, 0);
    // Malformed or legacy cycles must not make folders unreachable or recurse indefinitely.
    for (const folder of view.folders) if (!visited.has(folder.id) && (!folder.parentId || !folderIds.has(folder.parentId))) visit(folder, 0);
    if (!shown) view.folderList.append(element('div', 'av-empty', query ? '没有找到匹配的文件夹' : '暂无文件夹，请新建。'));
  }

  function renderCreateButton(view) {
    view.createForm?.remove();
    view.createForm = null;
    view.createArea.replaceChildren();
    const create = button('av-new-folder', '＋  新建文件夹', () => showCreateForm(view));
    create.disabled = view.busy;
    view.createArea.append(create);
  }

  function appendFolderLabel(node, view, folder) {
    const names = folderFullPath(view,folder).split(' / ');
    node.title = folderFullPath(view,folder);
    node.append(element('strong', '', names[0]));
    if (names.length > 1) node.append(element('span', '', (names.length > 3 ? '… / ' : '') + names.slice(names.length > 3 ? -2 : 1).join(' / ')));
  }
  function updateSaveDestination(view) {
    const selected = view.folders.find(folder => folder.id === view.selectedFolderId);
    view.destination.replaceChildren();
    if (selected) appendFolderLabel(view.destination, view, selected);
    else view.destination.textContent = '选择存放文件夹';
    view.saveButton.disabled = view.busy || !selected;
  }
  function selectFolder(view, folder) {
    if (view.closed || view.busy || view.triggered) return;
    view.selectedFolderId = folder.id;
    setError(view, '');
    // Keep the clicked node alive so the browser can deliver the second click and dblclick.
    for (const choose of view.folderList.querySelectorAll('.av-folder-button')) {
      const selected = choose.dataset.folderId === folder.id;
      choose.setAttribute('aria-pressed', String(selected));
      choose.closest('.av-folder-row').classList.toggle('selected', selected);
    }
    updateSaveDestination(view);
  }
  function saveSelection(view) {
    const folder = view.folders.find(folder => folder.id === view.selectedFolderId);
    if (!folder) { setError(view, '请选择存放文件夹'); view.search.focus(); return; }
    return chooseFolder(view, folder);
  }

  function folderFullPath(view,folder) {
    const names=[],seen=new Set();while(folder&&!seen.has(folder.id)){seen.add(folder.id);names.unshift(folder.name);folder=view.folders.find(f=>f.id===folder.parentId);}return names.join(' / ');
  }
  function showCreateForm(view) {
    if (view.busy || view.closed) return;
    const form = element('form', 'av-create-form');
    view.createForm = form;
    const name = input('文件夹名称');
    name.required = true;
    name.maxLength = 80;
    name.setAttribute('aria-label', '新文件夹名称');
    const parent = element('select', 'av-select');
    parent.setAttribute('aria-label', '新文件夹上级目录');
    const root = element('option', '', '资料库顶层'); root.value = ''; parent.append(root);
    for (const folder of view.folders) { const option = element('option', '', folderFullPath(view,folder)); option.value = folder.id; parent.append(option); }
    const actions = element('div', 'av-create-actions');
    const cancel = button('av-small-button', '取消', () => renderCreateButton(view));
    const save = element('button', 'av-small-button av-primary', '创建文件夹'); save.type = 'submit';
    actions.append(cancel, save);
    form.append(name, parent, actions);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (view.busy || !name.value.trim()) return;
      setBusy(view, true); setError(view, '');
      try {
        const created = await message({type: 'folder.create', name: name.value.trim(), parentId: parent.value || null});
        if (view.closed) return;
        await loadState(view);
        setBusy(view, false);
        const folder = view.folders.find(folder => folder.id === created.id);
        if (folder) selectFolder(view, folder);
        renderCreateButton(view);
        toast('文件夹已创建');
      } catch (error) { setBusy(view, false); setError(view, error.message); }
    });
    view.createArea.replaceChildren();
    view.bottom.prepend(form);
    name.focus();
  }

  function visiblePaywall() {
    if (!document.body || typeof document.createTreeWalker !== 'function') return false;
    const phrase = 'Upgrade your plan to experience more features';
    const walker = document.createTreeWalker(document.body, 4);
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (!textNode.nodeValue?.includes('Upgrade')) continue;
      for (let node = textNode.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim().replace(/[.!。！]$/, '');
        if (text === phrase && adapter.rendered(node) && adapter.inViewport(node)) return true;
      }
    }
    return false;
  }

  function watchPaywall(assetId) {
    let stopped = false;
    let scheduled = null;
    let timer;
    const observer = new MutationObserver(() => {
      if (scheduled === null && !stopped) scheduled = setTimeout(inspect, 120);
    });
    function stop() {
      if (stopped) return;
      stopped = true; observer.disconnect(); clearTimeout(scheduled); clearTimeout(timer);
    }
    function inspect() {
      scheduled = null;
      if (stopped) return;
      if (!pendingAssets.has(assetId)) { stop(); return; }
      if (!visiblePaywall()) return;
      stop(); pendingAssets.delete(assetId);
      // This exact denial was observed on BigSpy. A generic Upgrade CTA is not treated as a denial.
      message({type: 'capture.blocked', assetId, reason: 'paywall'}).catch(() => {});
      toast('BigSpy 下载需要升级套餐。', true, 8000);
    }
    observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'], characterData: true});
    scheduled = setTimeout(inspect, 0);
    // Observe only the immediate native-download response; background still owns the 120-second capture expiry.
    timer = setTimeout(stop, 15000);
    return stop;
  }

  async function chooseFolder(view, folder) {
    if (view.closed || view.busy || view.triggered) return;
    setError(view, '');
    if (adapter.mode === 'native' && visiblePaywall()) {
      setError(view, 'BigSpy 下载需要升级套餐。');
      return;
    }
    const target = adapter.validate(view.capture, view.capture.kind);
    if (!target.ok) { setError(view, target.message); toast(target.message, true, 10000); return; }
    const tags = [...new Set(view.tags.value.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))];
    if (tags.length > 30 || tags.some(tag => tag.length > 40)) {
      setError(view, '最多 30 个标签，每个最多 40 字。请缩短后再保存，当前输入未被修改。');
      return;
    }
    setBusy(view, true);
    let armed = null;
    const data = {
      folderId: folder.id,
      title: view.title.value.trim() || (view.capture.kind === 'video' ? '未命名视频' : '未命名图片'),
      notes: view.notes.value.trim(),
      tags,
      rating: view.rating,
      kind: view.capture.kind,
      platform: view.capture.platform,
      sourcePage: view.capture.page,
      ...(view.capture.research ? {research:view.capture.research} : {}),
      allowMissingReferrer: view.allowMissingReferrer.checked
    };
    try {
      if (target.mode === 'direct') {
        // Re-read the actual displayed media immediately before requesting the browser download.
        const direct = adapter.validate(view.capture, view.capture.kind);
        if (!direct.ok || direct.mode !== 'direct') throw new Error(direct.message || '素材来源已变化，请重新选择。');
        const result = await message({type: 'capture.direct', data: {...data, url: direct.url, kind: direct.kind}});
        if (!result?.ok || !result.assetId) throw new Error('未收到下载确认，请到素材库检查状态后重试。');
        view.assetId = result.assetId; view.triggered = true;
        pendingAssets.set(result.assetId, {title: data.title, since: Date.now(), mode: 'direct'});
        closePicker(view);
        toast('正在保存…', false, 4000);
        return;
      }
      armed = await message({type: 'capture.arm', data});
      if (!armed?.ok || !armed.assetId) throw new Error('未收到官方下载收集确认，未触发下载。请到素材库检查状态后重试。');
      view.assetId = armed.assetId;
      if (view.closed) { await message({type: 'capture.cancel', assetId: armed.assetId}).catch(() => {}); return; }
      const finalTarget = adapter.validate(view.capture, view.capture.kind);
      if (!finalTarget.ok || finalTarget.control !== target.control || finalTarget.card !== target.card) throw new Error(finalTarget.message || '下载控件已变化，已取消收集，请重新选择素材。');
      // A single invocation of the validated native control. No guessing media endpoints, fetch, or preview downloads.
      const pending = {title: view.title.value.trim(), since: Date.now(), mode: 'native', onSaved:view.returnToListing};
      pendingAssets.set(armed.assetId, pending);
      pending.stopWatch = watchPaywall(armed.assetId);
      const videoMenus = new Set([...document.querySelectorAll('[role="menu"]')].filter(adapter.rendered));
      finalTarget.control.click();
      if (view.capture.research && view.capture.kind === 'video' && /^Download$/i.test(finalTarget.control.innerText.trim())) await chooseNativeVideo(view.capture,videoMenus);
      view.triggered = true;
      closePicker(view);
      toast('正在下载…', false, 4000);
    } catch (error) {
      if (armed?.assetId && !view.triggered) {
        pendingAssets.get(armed.assetId)?.stopWatch?.();
        pendingAssets.delete(armed.assetId);
        await message({type: 'capture.cancel', assetId: armed.assetId}).catch(() => {});
      }
      view.assetId = null;
      if (!view.closed) { setBusy(view, false); setError(view, error.message); }
      toast(error.message || '未能触发官方下载，请重试。', true, 9000);
    }
  }

  function chooseNativeVideo(capture,existing) {
    return new Promise((resolve,reject)=>{
      let done=false,timer,scheduled;
      const observer=new MutationObserver(()=>{if(!scheduled)scheduled=setTimeout(inspect,40);});
      function finish(error){if(done)return;done=true;observer.disconnect();clearTimeout(timer);clearTimeout(scheduled);error?reject(error):resolve();}
      function inspect(){
        scheduled=null;
        if(!capture.element.isConnected||adapter.mediaIdentity(capture.element)!==capture.identity||adapter.researchData(capture.element)?.adId!==capture.research.adId)return finish(new Error('广告已切换，请重新收藏'));
        const menus=[...document.querySelectorAll('[role="menu"]')].filter(menu=>!existing.has(menu)&&adapter.rendered(menu));
        const choices=menus.flatMap(menu=>[...menu.querySelectorAll('[role="menuitem"]')].filter(item=>/^Download Video$/i.test(item.textContent.trim())&&adapter.rendered(item)));
        if(choices.length>1)return finish(new Error('视频下载选项不明确，请重试'));
        if(choices.length===1){if(adapter.permissionBlocked(choices[0]))return finish(new Error('BigSpy 当前不允许下载这段视频'));choices[0].click();finish();}
      }
      observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-hidden']});
      // BigSpy's main Download action can start the video directly; only select a menu when one opens.
      timer=setTimeout(()=>finish(),2500);inspect();
    });
  }

  async function collectListingMedia(media, badge) {
    if (!captureEnabled || badge.disabled) return;
    const target=adapter.findDetails(media);
    if (!target.ok) { toast(target.message,true); return; }
    const capture={element:media,identity:adapter.mediaIdentity(media),page:location.href,card:target.card,control:target.control};
    const valid=adapter.validateDetails(capture);
    if (!valid.ok) { toast(valid.message,true); return; }
    const identity=source => { try { const url=new URL(source); return url.origin+url.pathname; } catch { return ''; } };
    const expected=identity(adapter.mediaSource(media));
    if (!expected) return;
    const existing=new Set([...document.querySelectorAll('[role="dialog"],dialog')].filter(adapter.rendered));
    badge.disabled=true;
    try {
      const result=await new Promise((resolve,reject)=>{
        let timer,scheduled,done=false;
        const observer=new MutationObserver(()=>{ if (!scheduled) scheduled=setTimeout(inspect,60); });
        function finish(error,result) { if(done)return;done=true;observer.disconnect();clearTimeout(timer);clearTimeout(scheduled);error?reject(error):resolve(result); }
        function inspect() {
          scheduled=null;
          if (!captureEnabled || disposed || location.href!==capture.page || !media.isConnected || adapter.mediaIdentity(media)!==capture.identity) return finish(new Error('页面素材已变化，请重新收藏'));
          for (const root of document.querySelectorAll('[role="dialog"],dialog')) {
            if (existing.has(root) || !adapter.rendered(root)) continue;
            const primary=[...root.querySelectorAll('img,video')].filter(node=>adapter.rendered(node)&&node.getBoundingClientRect().width>=140&&node.getBoundingClientRect().height>=140);
            if(primary.length!==1)continue;
            const original=primary[0],source=original.tagName==='VIDEO'?original.poster:adapter.mediaSource(original);
            if(identity(source)!==expected)continue;
            const research=adapter.researchData(original),download=adapter.findDownload(original);
            if(download.reason==='permission-blocked')return finish(new Error(download.message));
            if(!download.ok||!research?.network)continue;
            return finish(null,{original,root,adId:research.adId});
          }
        }
        observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','poster','style','class','aria-hidden'],characterData:true});
        timer=setTimeout(()=>finish(new Error('未能读取这条素材的原文件，请重试')),15000);
        try { valid.control.click(); inspect(); } catch(error) { finish(error); }
      });
      const returnToListing=()=>{
        if (!result.root.isConnected || adapter.researchData(result.original)?.adId!==result.adId) return;
        const wrapper = result.root.closest('.ant-modal-wrap');
        if (wrapper) {
          wrapper.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
          wrapper.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}));
          wrapper.click();
        }
        else result.root.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true}));
      };
      openPicker(result.original,badge,returnToListing);
    } catch(error) { if (captureEnabled) toast(error.message || '素材暂时无法收藏',true); }
    finally { if(badge.isConnected)badge.disabled=false;scheduleScan(); }
  }

  function scan() {
    scanTimer = null; lastScan = Date.now();
    if (!chrome.runtime?.id) { applyCaptureEnabled(false); host.remove(); return; }
    if (disposed || !captureEnabled) return;
    if (!host.isConnected) document.documentElement.append(host);
    const candidates = new Set([...document.querySelectorAll('img, video')].filter(media => adapter.eligibleMedia(media)));
    for (const [media, badge] of mediaButtons) if (!candidates.has(media)) { badge.remove(); mediaButtons.delete(media); }
    for (const media of candidates) {
      let badge = mediaButtons.get(media);
      if (!badge) {
        badge = button('av-badge', undefined, event => {
          event.preventDefault(); event.stopPropagation();
          if (adapter.listingCard(media)) {
            collectListingMedia(media,badge);
          }
          else openPicker(media, badge);
        });
        badge.append(element('span', 'av-badge-mark', '✦'), element('span', '', '收藏'));
        badge.title = '收藏到 pikko. 文件夹';
        badge.setAttribute('aria-label', `收藏这${media.tagName === 'VIDEO' ? '段视频' : '张图片'}到 pikko.`);
        mediaButtons.set(media, badge);
        badges.append(badge);
      }
      const kind = adapter.listingCard(media) ? adapter.listingKind(media) : media.tagName === 'VIDEO' ? 'video' : 'image';
      badge.lastElementChild.textContent = '收藏';
      badge.title = '收藏到 pikko. 文件夹';
      badge.setAttribute('aria-label', `收藏这${kind === 'video' ? '段视频' : '张图片'}到 pikko.`);
      const rect = media.getBoundingClientRect();
      badge.style.left = `${Math.max(5, rect.left + 8)}px`;
      badge.style.top = `${Math.max(5, rect.top + 8)}px`;
      badge.hidden = Boolean(modal);
    }
  }
  function scheduleScan() {
    if (disposed || !captureEnabled || scanTimer !== null) return;
    scanTimer = setTimeout(scan, Math.max(0, 90 - (Date.now() - lastScan)));
  }
  const observer = new MutationObserver(scheduleScan);
  let interval = null;
  function applyCaptureEnabled(enabled) {
    if (disposed || enabled === captureEnabled) return;
    captureEnabled = enabled;
    if (enabled) {
      observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster', 'style', 'class', 'hidden']});
      window.addEventListener('scroll', scheduleScan, true);
      window.addEventListener('resize', scheduleScan);
      document.addEventListener('load', scheduleScan, true);
      document.addEventListener('loadedmetadata', scheduleScan, true);
      interval = setInterval(scheduleScan, 1400);
      scheduleScan();
    } else {
      observer.disconnect(); clearInterval(interval); interval = null; clearTimeout(scanTimer); scanTimer = null;
      window.removeEventListener('scroll', scheduleScan, true); window.removeEventListener('resize', scheduleScan);
      document.removeEventListener('load', scheduleScan, true); document.removeEventListener('loadedmetadata', scheduleScan, true);
      try { closePicker(); }
      finally { badges.replaceChildren(); mediaButtons.clear(); }
    }
  }
  let preferenceRevision = 0;
  function setCapturePreference(enabled) {
    preferenceRevision++;
    applyCaptureEnabled(enabled);
  }
  globalThis.__pikkoCaptureControl = setCapturePreference;
  const preferenceListener = (changes, area) => {
    if (area !== 'local' || !changes.captureEnabled) return;
    setCapturePreference(changes.captureEnabled.newValue !== false);
  };
  chrome.storage.onChanged.addListener(preferenceListener);
  function readCapturePreference() {
    const revision = preferenceRevision;
    chrome.storage.local.get('captureEnabled').then(data => {
      if (revision === preferenceRevision) applyCaptureEnabled(data.captureEnabled !== false);
    }).catch(() => {
      if (revision === preferenceRevision) applyCaptureEnabled(false);
    });
  }
  readCapturePreference();
  try {
    chrome.runtime.onMessage.addListener(payload => {
      if (payload?.type !== 'capture.status' || !pendingAssets.has(payload.assetId)) return;
      if (['downloaded', 'complete', 'completed', 'saved', 'ready'].includes(payload.status)) {
        const completed = pendingAssets.get(payload.assetId);
        completed?.stopWatch?.();
        completed?.onSaved?.();
        pendingAssets.delete(payload.assetId);
        toast('已保存', false, 3500);
      } else if (['error', 'failed', 'expired', 'cancelled', 'canceled', 'interrupted'].includes(payload.status)) {
        pendingAssets.get(payload.assetId)?.stopWatch?.();
        pendingAssets.delete(payload.assetId);
        toast(payload.error || '下载未完成，请在资料库查看原因。', true, 8000);
      }
    });
  } catch (_) { /* A refreshed extension invalidates old page contexts; next interaction reports that connection error. */ }
  window.addEventListener('pageshow', event => {
    if (!event.persisted || disposed) return;
    applyCaptureEnabled(false);
    readCapturePreference();
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) { applyCaptureEnabled(false); return; }
    disposed = true; observer.disconnect(); clearInterval(interval); clearTimeout(scanTimer); closePicker();
    chrome.storage.onChanged.removeListener(preferenceListener);
    for (const pending of pendingAssets.values()) pending.stopWatch?.();
    window.removeEventListener('scroll', scheduleScan, true); window.removeEventListener('resize', scheduleScan);
    document.removeEventListener('load', scheduleScan, true); document.removeEventListener('loadedmetadata', scheduleScan, true);
  });
  scheduleScan();
})();
