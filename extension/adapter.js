/* Conservative native BigSpy adapter plus explicitly enabled visible-media adapter. No network calls. */
(() => {
  'use strict';
  const CONTROL_SELECTOR = 'button, a, [role="button"]';
  const DOWNLOAD_LABEL = /^(?:download(?:\s+(?:original|source|hd))?(?:\s+(?:image|video|file|creative|asset|media))?(?:\s+(?:original|source|hd))?|(?:下载|下載)(?:原图|原圖|原视频|原視頻|图片|圖片|视频|視頻|素材|文件|原文件|高清图片|高清圖片|高清视频|高清視頻|原始素材)?)$/i;
  const BULK_WORD = /(?:\ball\b|\bbulk\b|\bbatch\b|全部|所有|批量|批次)/i;
  const BLOCKED = '未能安全识别该素材的官方下载按钮。请点击该素材官方 Download，再导入/连接本地文件；没有把预览当作原文件保存。';
  const DETAILS_REQUIRED = '请先打开这条广告的 Creative Details（创意详情），再点击详情主素材上的收藏按钮。若详情里仍没有可用的官方 Download，请使用平台允许的下载方式后导入本地文件；没有把预览当作原文件保存。';

  function mode() {
    try { return /(^|\.)bigspy\.com$/i.test(new URL(location.href).hostname) ? 'native' : 'direct'; } catch (_) { return 'native'; }
  }

  function rendered(element) {
    if (!element?.isConnected || element.nodeType !== 1 || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !element.getClientRects().length) return false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
    }
    return true;
  }

  function inViewport(element) {
    const r = element.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  function unobscuredMedia(element) {
    if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return true;
    const r = element.getBoundingClientRect();
    let left = Math.max(0, r.left), top = Math.max(0, r.top);
    let right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      // The root scrollport is the viewport above, not the document's scrolled border box.
      if (parent.tagName === 'HTML' || parent.tagName === 'BODY') continue;
      const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
      if (/^(hidden|clip|auto|scroll)$/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (/^(hidden|clip|auto|scroll)$/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
    const width = right - left, height = bottom - top;
    if (width < 140 || height < 140) return false;
    // Native video control/poster masks can be siblings of the player (observed on TikTok).
    // Keep video clipping checks; pointer hit testing here only hides obscured images.
    if (element.tagName === 'VIDEO') return true;
    const contains = (ancestor, node) => { for (; node; node = node.parentElement) if (node === ancestor) return true; return false; };
    return [.5, .2, .8].some(fraction => {
      const hit = document.elementsFromPoint(left + width * fraction, top + height * fraction)
        .find(node => {
          if (node.id === 'ad-vault-v2-capture-root') return false;
          if (mode() === 'native' && node.parentElement === element.parentElement && /(?:^|\s)ant-image-cover(?:\s|$)/.test(node.className || '') && !node.children.length && !(node.textContent || '').trim()) {
            const cover = node.getBoundingClientRect();
            if (['left','top','right','bottom'].every(edge => Math.abs(cover[edge] - r[edge]) < 1)) return false;
          }
          const card = listingCard(element);
          if (card && articleContainer(node) === card && ((node.tagName === 'BUTTON' && node.getAttribute('aria-label') === 'Creative Details' && enabled(node)) || (backgroundDuplicate(node) && mediaSource(node) === mediaSource(element)))) return false;
          // Instagram places an empty transparent tag mask over the photo, beside its wrapper.
          if (new URL(location.href).hostname === 'www.instagram.com' && node.tagName === 'DIV' && node.parentElement === element.parentElement?.parentElement && !node.children.length && !(node.textContent || '').trim()) {
            const style = getComputedStyle(node), mask = node.getBoundingClientRect();
            if (style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none' && (!style.boxShadow || style.boxShadow === 'none') && ['left', 'top', 'right', 'bottom'].every(edge => Math.abs(mask[edge] - r[edge]) < 1)) return false;
          }
          return true;
        });
      return hit && (contains(hit, element) || contains(element, hit));
    });
  }

  function mediaSource(element) {
    if (element?.tagName === 'IMG') return element.currentSrc || element.src || '';
    if (element?.tagName === 'VIDEO') return element.currentSrc || element.src || element.querySelector('source[src]')?.src || '';
    return '';
  }

  function mediaIdentity(element) {
    return JSON.stringify([element?.tagName, mediaSource(element), element?.getAttribute('src') || '', element?.getAttribute('srcset') || '', element?.tagName === 'VIDEO' ? element.poster || '' : '', publishedVideoFile(element)]);
  }

  function publishedVideoFile(element) {
    // Bind site-published complete MP4 files to the exact current item and actual player.
    if (element?.tagName !== 'VIDEO') return '';
    try {
      const page = new URL(location.href);
      const source = mediaSource(element);
      const facebookWorker = page.hostname === 'www.facebook.com' && !source && element.srcObject?.constructor?.name === 'MediaSourceHandle';
      if (!source.startsWith('blob:') && !facebookWorker) return '';
      if (page.hostname === 'www.facebook.com') {
        const videoId = value => /^\/(?:reel|[^/]+\/videos(?:\/[^/]+)?)\/(\d+)\/?$/.exec(value.pathname)?.[1];
        const id = videoId(page), canonical = new URL(document.querySelector('meta[property="og:url"]')?.content);
        const players = [...document.querySelectorAll('video')].filter(rendered);
        if (!id || canonical.origin !== page.origin || videoId(canonical) !== id || players.length !== 1 || players[0] !== element || [...document.querySelectorAll('[role="dialog"]')].some(rendered) || !(element.duration > 0) || !(element.videoWidth > 0 && element.videoHeight > 0)) return '';
        const records = [];
        const visit = (value, depth) => {
          if (!value || typeof value !== 'object' || depth > 24) return;
          if (value.video?.story?.attachments) {
            for (const attachment of value.video.story.attachments) if (attachment.media?.__typename === 'Video' && String(attachment.media.id) === id) records.push(attachment.media);
            return;
          }
          for (const child of Object.values(value)) visit(child, depth + 1);
        };
        for (const script of document.querySelectorAll('script[type="application/json"]')) {
          if (!script.textContent.includes(id) || !script.textContent.includes('browser_native_sd_url')) continue;
          try { visit(JSON.parse(script.textContent), 0); } catch (_) { /* Ignore incomplete page data. */ }
        }
        if (records.length !== 1) return '';
        const record = records[0], permalink = new URL(record.permalink_url);
        const drm = typeof record.drm_info === 'string' ? JSON.parse(record.drm_info) : record.drm_info;
        if (permalink.origin !== page.origin || videoId(permalink) !== id || record.is_live_streaming !== false || drm?.graph_api_video_license_uri || Object.keys(drm?.video_license_uri_map || {}).length || !Number.isFinite(record.playable_duration_in_ms) || Math.abs(record.playable_duration_in_ms / 1000 - element.duration) > 1 || !(record.width > 0 && record.height > 0) || Math.abs(record.width / record.height - element.videoWidth / element.videoHeight) > .01) return '';
        const file = new URL(record.videoDeliveryLegacyFields?.browser_native_sd_url);
        if (file.protocol !== 'https:' || !file.hostname.endsWith('.fbcdn.net') || !file.pathname.endsWith('.mp4') || file.username || file.password) return '';
        return file.href;
      }
      const reelPath = /^\/([^/]+)\/(?:reel|p)\/([A-Za-z0-9_-]+)\/$/.exec(page.pathname);
      if (page.hostname === 'www.instagram.com' && reelPath) {
        const canonical = new URL(document.querySelector('meta[property="og:url"]')?.content);
        const canonicalPath = /^\/([^/]+)\/(?:reel|p)\/([A-Za-z0-9_-]+)\/$/.exec(canonical.pathname);
        const players = [...document.querySelectorAll('video')].filter(rendered);
        if (canonical.origin !== page.origin || !canonicalPath || canonicalPath[1].toLowerCase() !== reelPath[1].toLowerCase() || canonicalPath[2] !== reelPath[2] || players.length !== 1 || players[0] !== element || !(element.duration > 0) || !(element.videoWidth > 0 && element.videoHeight > 0)) return '';
        const records = [];
        const visit = (value, depth) => {
          if (!value || typeof value !== 'object' || depth > 24) return;
          const record = value.xig_polaris_media?.if_not_gated_logged_out;
          if (record?.code === reelPath[2]) records.push(record);
          for (const child of Object.values(value)) visit(child, depth + 1);
        };
        for (const script of document.querySelectorAll('script[type="application/json"]')) {
          if (!script.textContent.includes('"video_versions"') || !script.textContent.includes(reelPath[2])) continue;
          try { visit(JSON.parse(script.textContent), 0); } catch (_) { /* Ignore incomplete page data. */ }
        }
        if (records.length !== 1) return '';
        const record = records[0];
        if (record.media_type !== 2 || record.user?.is_private !== false || record.user.username?.toLowerCase() !== reelPath[1].toLowerCase() || !(record.original_width > 0 && record.original_height > 0) || Math.abs(record.original_width / record.original_height - element.videoWidth / element.videoHeight) > .01) return '';
        for (const version of record.video_versions || []) {
          const file = new URL(version.url);
          if (file.protocol === 'https:' && file.hostname.endsWith('.cdninstagram.com') && file.pathname.endsWith('.mp4') && !file.username && !file.password) return file.href;
        }
        return '';
      }
      if (page.hostname === 'www.pinterest.com' && /^\/pin\/\d+\/$/.test(page.pathname)) {
        const id = page.pathname.split('/')[2];
        const pin = JSON.parse(document.querySelector('script#__PWS_INITIAL_PROPS__')?.textContent || 'null')?.initialReduxState?.pins?.[id];
        const players = [...document.querySelectorAll('video')].filter(rendered);
        if (!pin || String(pin.id) !== id || pin.is_viewer_restricted !== false || pin.is_hidden !== false || pin.is_eligible_for_image_download === false || players.length !== 1 || players[0] !== element) return '';
        if (!element.poster || !Object.values(pin.images || {}).some(image => image.url === element.poster)) return '';
        const published = pin.videos?.video_list?.V_720P;
        if (!Number.isFinite(element.duration) || element.duration <= 0 || !Number.isFinite(published?.duration) || Math.abs(published.duration / 1000 - element.duration) > 1) return '';
        const file = new URL(published.url);
        if (file.protocol !== 'https:' || file.hostname !== 'v1.pinimg.com' || !file.pathname.startsWith('/videos/') || !file.pathname.endsWith('.mp4') || file.username || file.password) return '';
        return file.href;
      }
      if (page.hostname !== 'www.xiaohongshu.com' || !/^\/explore\/[a-f0-9]{24}$/.test(page.pathname)) return '';
      for (const value of [document.querySelector('link[rel="canonical"]')?.href, document.querySelector('meta[property="og:url"]')?.content]) {
        const declared = new URL(value);
        if (declared.origin !== page.origin || declared.pathname !== page.pathname) return '';
      }
      const players = [...document.querySelectorAll('video')].filter(rendered);
      if (players.length !== 1 || players[0] !== element) return '';
      const time = document.querySelector('meta[property="og:videotime"]')?.content || '';
      if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(time)) return '';
      const seconds = time.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
      if (!Number.isFinite(element.duration) || seconds <= 0 || Math.abs(element.duration - seconds) > 2) return '';
      const file = new URL(document.querySelector('meta[property="og:video"]')?.content);
      if (!['http:', 'https:'].includes(file.protocol) || !file.hostname.endsWith('.xhscdn.com') || !file.pathname.endsWith('.mp4') || file.username || file.password) return '';
      return file.href;
    } catch (_) { return ''; }
  }

  function articleContainer(element) {
    for (let node = element?.parentElement; node; node = node.parentElement) if (node.tagName === 'ARTICLE') return node;
    return null;
  }

  function listingCard(element) {
    if (mode() !== 'native') return null;
    const article = articleContainer(element);
    if (!article) return null;
    for (let node = article.parentElement; node; node = node.parentElement) {
      if (node.getAttribute('data-testid') === 'ad-list-grid') return article;
    }
    return null;
  }

  function findDetails(selected) {
    const card = listingCard(selected);
    if (!card || !eligibleMedia(selected)) return {ok: false, reason: 'no-verified-listing', message: DETAILS_REQUIRED};
    const candidates = [...card.querySelectorAll(CONTROL_SELECTOR)].filter(control => control.tagName === 'BUTTON' && control.getAttribute('aria-label') === 'Creative Details' && articleContainer(control) === card);
    // Live BigSpy renders an overlay and a center button for the same ARTICLE. Open only one enabled control.
    const control = candidates.find(enabled);
    if (!control) return {ok: false, reason: candidates.some(node => permissionBlocked(node)) ? 'permission-blocked' : 'no-safe-details-control', message: candidates.some(node => permissionBlocked(node)) ? 'BigSpy 当前限制打开这条广告的创意详情。请在平台处理权限，不会绕过限制。' : DETAILS_REQUIRED};
    return {ok: true, card, control};
  }

  function listingKind(selected) {
    const card=listingCard(selected);
    return selected?.tagName==='VIDEO' || card?.querySelector('video, [aria-label="Play"], [aria-label="play"], .lucide-play') ? 'video' : 'image';
  }

  function validateDetails(capture) {
    if (!capture?.element?.isConnected || capture.page !== location.href || mediaIdentity(capture.element) !== capture.identity || listingCard(capture.element) !== capture.card || !eligibleMedia(capture.element)) {
      return {ok: false, reason: 'stale-media', message: '这条广告已变化，请重新点击当前广告上的打开详情按钮。'};
    }
    const control = capture.control;
    if (!control?.isConnected || control.tagName !== 'BUTTON' || control.getAttribute('aria-label') !== 'Creative Details' || articleContainer(control) !== capture.card || !enabled(control)) {
      return {ok: false, reason: 'stale-details-control', message: '创意详情按钮已变化或不可用，请在这条广告上手动打开 Creative Details。'};
    }
    return {ok: true, card: capture.card, control};
  }

  function backgroundDuplicate(element) {
    if (mode() !== 'native' || element?.tagName !== 'IMG' || (element.getAttribute('alt') || '').trim().toLowerCase() !== 'background') return false;
    const article = articleContainer(element);
    if (!article) return false;
    let inVerifiedGrid = false;
    for (let node = article.parentElement; node; node = node.parentElement) {
      if (node.getAttribute('data-testid') === 'ad-list-grid') { inVerifiedGrid = true; break; }
    }
    if (!inVerifiedGrid) return false;
    const source = mediaSource(element);
    if (!source) return false;
    // The observed BigSpy card paints the same image twice, once as a blurred background.
    // URL equality is required at runtime; alt text alone never proves duplication.
    return [...article.querySelectorAll('img')].some(other => {
      if (other === element || other.tagName !== 'IMG' || articleContainer(other) !== article || (other.getAttribute('alt') || '').trim().toLowerCase() === 'background') return false;
      if (mediaSource(other) !== source || !rendered(other)) return false;
      const rect = other.getBoundingClientRect();
      return rect.width >= 140 && rect.height >= 140;
    });
  }

  function eligibleMedia(element, viewport = true) {
    if (!element || !['IMG', 'VIDEO'].includes(element.tagName) || !rendered(element) || backgroundDuplicate(element)) return false;
    const r = element.getBoundingClientRect();
    if (r.width < 140 || r.height < 140 || (viewport && (!inViewport(element) || !unobscuredMedia(element)))) return false;
    return Boolean(mediaSource(element) || (element.tagName === 'VIDEO' && (element.poster || publishedVideoFile(element))));
  }

  function downloadLabel(control) {
    const labels = [control.innerText || control.textContent || '', control.getAttribute('title') || '', control.getAttribute('aria-label') || '']
      .map(text => text.replace(/[\uE000-\uF8FF]/g, '').replace(/[()（）]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(text => /[a-z0-9\u3400-\u9fff]/i.test(text));
    // A generic 'Download tutorial' or 'Download app' is not evidence of a creative download.
    return labels.length > 0 && labels.every(text => !BULK_WORD.test(text) && DOWNLOAD_LABEL.test(text));
  }

  function permissionBlocked(control, checkPointerEvents = true) {
    for (let node = control; node && node.nodeType === 1; node = node.parentElement) {
      // Ant Design's modal shell is noninteractive; its content explicitly restores pointer events.
      const modalShell = mode() === 'native' && node.getAttribute('role') === 'dialog' && node.getAttribute('aria-modal') === 'true' && /(?:^|\s)ant-modal(?:\s|$)/.test(node.className || '');
      if (checkPointerEvents && getComputedStyle(node).pointerEvents === 'none' && !modalShell) return true;
      if (node.getAttribute('aria-disabled') === 'true' || node.getAttribute('disabled') !== null) return true;
      // Observed on BigSpy's disabled, plan-gated official Download wrapper.
      const classes = typeof node.className === 'string' ? node.className : '';
      if (/module-permission-wrapper[^\s]*__disabled/.test(classes)) return true;
    }
    return false;
  }

  function enabled(control) {
    if (!rendered(control) || control.matches(':disabled, [disabled], [aria-disabled="true"]')) return false;
    if (control.closest('[aria-disabled="true"], fieldset[disabled]')) return false;
    return !permissionBlocked(control);
  }

  function downloadControls(card) {
    // Nested role=button wrappers are deliberately ambiguous; do not guess which one owns the handler.
    return [...card.querySelectorAll(CONTROL_SELECTOR)].filter(control => {
      return downloadLabel(control) && enabled(control);
    });
  }

  function unrelatedMedia(card, selected) {
    return [...card.querySelectorAll('img, video')].some(media => {
      if (media === selected || !rendered(media)) return false;
      if (selected.tagName === 'IMG' && backgroundDuplicate(media) && articleContainer(media) === articleContainer(selected) && mediaSource(media) === mediaSource(selected)) return false;
      const r = media.getBoundingClientRect();
      // Small interface icons do not count as a second creative. Poster/thumbnail ambiguity fails closed.
      return r.width >= 72 && r.height >= 72;
    });
  }

  function findDownload(selected) {
    if (!eligibleMedia(selected, false)) return {ok: false, reason: 'missing-media', message: BLOCKED};
    let card = selected.parentElement;
    const mediaRect = selected.getBoundingClientRect();
    for (let depth = 0; card && depth < 7; depth++, card = card.parentElement) {
      if (['HTML', 'BODY', 'MAIN'].includes(card.tagName) || ['list', 'grid', 'feed'].includes(card.getAttribute('role'))) break;
      if (unrelatedMedia(card, selected)) return {ok: false, reason: 'multiple-media', message: BLOCKED};
      const permissionLocked = [...card.querySelectorAll(CONTROL_SELECTOR)].some(control => downloadLabel(control) && rendered(control) && permissionBlocked(control));
      if (permissionLocked) return {ok: false, reason: 'permission-blocked', message: 'BigSpy 当前不允许这项官方下载。请先在 BigSpy 处理下载权限；没有把预览当作原文件保存，也不会绕过限制。'};
      const controls = downloadControls(card);
      if (controls.length > 1) return {ok: false, reason: 'multiple-downloads', message: BLOCKED};
      if (controls.length === 1) {
        const rect = card.getBoundingClientRect();
        const controlRect = controls[0].getBoundingClientRect();
        const gapX = Math.max(0, mediaRect.left - controlRect.right, controlRect.left - mediaRect.right);
        const gapY = Math.max(0, mediaRect.top - controlRect.bottom, controlRect.top - mediaRect.bottom);
        if (rect.width > Math.max(1000, mediaRect.width * 3) || rect.height > Math.max(1200, mediaRect.height * 4) || gapX > 320 || gapY > 400) break;
        return {ok: true, mode: 'native', card, control: controls[0]};
      }
      const hasDetails = [...card.querySelectorAll(CONTROL_SELECTOR)].some(control => /^(?:creative details|创意详情|創意詳情)$/i.test((control.innerText || control.textContent || control.getAttribute('aria-label') || '').trim()) && rendered(control));
      if (hasDetails) return {ok: false, reason: 'details-required', message: DETAILS_REQUIRED};
    }
    return {ok: false, reason: 'no-local-download', message: DETAILS_REQUIRED};
  }

  function visibleAccessGate() {
    if (typeof document === 'undefined' || !document.body || typeof document.createTreeWalker !== 'function') return false;
    const phrases = new Set(['upgrade your plan to experience more features', 'subscribe to watch', 'subscribe to continue watching', 'this video is available to subscribers only', 'purchase to watch', '订阅后观看', '付费后观看', '购买后观看']);
    const walker = document.createTreeWalker(document.body, 4);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const value = (textNode.nodeValue || '').replace(/\s+/g, ' ').trim().replace(/[.!。！]$/, '').toLowerCase();
      if (phrases.has(value) && rendered(textNode.parentElement) && inViewport(textNode.parentElement)) return true;
    }
    return false;
  }

  function directTarget(element) {
    const deny = (reason, message) => ({ok: false, reason, message});
    // BigSpy is intentionally never eligible for the generic direct route, even if it exposes a CDN URL.
    if (mode() !== 'direct') return deny('native-only', BLOCKED);
    if (!eligibleMedia(element, false)) return deny('missing-media', '页面素材已不可用，请重新选择。');
    // Visible media can sit in a noninteractive styling wrapper (observed in Meta's ad dialog).
    // Pointer events matter for clicking native Download controls, not for reading media URLs.
    if (permissionBlocked(element, false) || visibleAccessGate()) return deny('permission-blocked', '页面显示访问或付费限制，不能直接收集这份素材。请使用平台允许的下载方式，不会绕过限制。');
    const kind = element.tagName === 'VIDEO' ? 'video' : 'image';
    if (kind === 'video' && element.mediaKeys) return deny('protected-video', '这是受保护的视频，不能直接收集。请使用平台允许的下载方式。');
    const source = kind === 'video' ? publishedVideoFile(element) || element.currentSrc || '' : element.currentSrc || element.src || '';
    let url;
    try { url = new URL(source); } catch (_) { return deny('unsupported-source', '未找到当前素材可直接保存的 HTTP(S) 文件。视频封面不会当作视频保存。'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return deny('unsupported-source', '只支持当前可访问的 HTTP(S) 媒体文件，不收集 blob、data 或带账户凭据的地址。');
    let decoded = url.href;
    try { decoded = decodeURIComponent(decoded); } catch (_) {}
    if (/\.(?:m3u8?|mpd)(?:$|[?#/&=])/i.test(decoded) || /(?:[?&](?:format|type|mime)=)(?:hls|dash|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i.test(decoded)) {
      return deny('stream-manifest', '这是 HLS/DASH 流媒体清单，不是独立视频文件。不会下载清单或把封面当作视频。');
    }
    if (kind === 'video') {
      const type = element.getAttribute('type') || '';
      const selectedSource = [...element.querySelectorAll('source')].find(node => node.src === source);
      if (/mpegurl|dash\+xml/i.test(`${type} ${selectedSource?.getAttribute('type') || ''}`)) return deny('stream-manifest', '这是流媒体或分片视频，不能作为一个完整视频文件直接保存。');
    }
    return {ok: true, mode: 'direct', url: url.href, kind};
  }

  function mediaPlatform(network = '', page = location.href) {
    if (/^(facebook|instagram|meta)$/i.test(network.trim())) return 'Meta';
    if (/^(google|youtube|admob)$/i.test(network.trim())) return 'Google';
    if (network.trim()) return '其他';
    const hostname = new URL(page).hostname;
    if (/(^|\.)(facebook\.com|instagram\.com)$/.test(hostname)) return 'Meta';
    if (/(^|\.)(google\.com|youtube\.com|youtu\.be)$/.test(hostname)) return 'Google';
    return '其他';
  }

  function snapshot(element) {
    const target = mode() === 'native' ? findDownload(element) : directTarget(element);
    const research = researchData(element);
    return {
      element,
      mode: mode(),
      identity: mediaIdentity(element),
      source: mediaSource(element),
      sourceObject: element.tagName === 'VIDEO' ? element.srcObject || null : null,
      poster: element.tagName === 'VIDEO' ? element.poster || '' : '',
      kind: element.tagName === 'VIDEO' ? 'video' : 'image',
      page: location.href,
      research,
      platform: mediaPlatform(research?.network),
      card: target.ok ? target.card : null,
      control: target.ok ? target.control : null
    };
  }

  function validate(capture, selectedKind) {
    if (!capture?.element?.isConnected || location.href !== capture.page || mediaIdentity(capture.element) !== capture.identity || (capture.sourceObject && capture.element.srcObject !== capture.sourceObject)) {
      return {ok: false, reason: 'stale-media', message: '页面素材已变化。请关闭窗口，重新点击目标素材上的收藏按钮。'};
    }
    if (mode() === 'direct') {
      const direct = directTarget(capture.element);
      if (direct.ok && selectedKind && selectedKind !== direct.kind) return {ok: false, reason: 'media-kind-mismatch', message: '当前元素不是所选类型。图片或视频封面不能当作视频保存；请播放页面中的实际视频后重新选择。'};
      return direct;
    }
    if (capture.research?.adId && researchData(capture.element)?.adId !== capture.research.adId) return {ok:false,reason:'stale-ad',message:'广告已切换，请重新点击当前素材收藏。'};
    const target = findDownload(capture.element);
    if (!target.ok) return target;
    if (capture.card && (target.card !== capture.card || target.control !== capture.control)) {
      return {ok: false, reason: 'stale-control', message: '该素材的下载控件已变化。请关闭窗口，重新选择素材，避免收错文件。'};
    }
    return target;
  }

  function researchData(selected) {
    if (mode() !== 'native') return null;
    let root = selected?.parentElement;
    while (root && root.tagName !== 'DIALOG' && root.getAttribute('role') !== 'dialog') root = root.parentElement;
    const pageURL = new URL(location.href), routeId = pageURL.pathname.match(/\/adspy\/creative\/([a-f0-9]{32}|\d{1,40})\/?$/i)?.[1];
    if (!root && routeId) for (let node=selected?.parentElement; node && !['HTML','BODY'].includes(node.tagName); node=node.parentElement) {
      if (/Creative Details|创意详情/.test(node.innerText || '') && (node.innerText || '').includes(routeId)) { root=node; break; }
    }
    if (!root || !rendered(root) || !/Creative Details|创意详情/.test(root.innerText || '')) return null;
    const primary = [...root.querySelectorAll('img, video')].filter(media => rendered(media) && media.getBoundingClientRect().width >= 140 && media.getBoundingClientRect().height >= 140);
    if (primary.length !== 1 || primary[0] !== selected) return null;
    const text = root.innerText || '';
    const adId = text.match(/\bID\s*[:：]\s*([a-f0-9]{32}|\d{1,40})\b/i)?.[1];
    if (!adId) return null;
    const nodes = [...root.querySelectorAll('div')];
    const label = name => nodes.find(node => node.textContent.trim() === name && node.nextElementSibling);
    const value = name => label(name)?.nextElementSibling?.innerText?.trim() || '';
    const fields = label('Platform')?.parentElement;
    const advertiser = fields?.previousElementSibling?.innerText?.split('\n').map(x=>x.trim()).filter(Boolean) || [];
    const download = [...root.querySelectorAll('button')].find(node => downloadLabel(node));
    let controls = download?.parentElement, copy;
    for (let depth=0; controls && depth<3; depth++,controls=controls.parentElement) {
      const previous=controls.previousElementSibling;
      if (previous?.tagName==='DIV' && previous.children.length>=2 && !previous.querySelector('button,img,video')) { copy=previous; break; }
    }
    const lines = copy ? [...copy.children].map(node => (node.textContent || '').trim()) : [];
    const running = value('Running Days').match(/^(\d[\d,]*)\s*(?:Days?|天)$/i);
    const dates = label('Running Days')?.parentElement?.innerText.match(/(\d{2,4})\/(\d{2})\/(\d{2})\s*[-–~]\s*(\d{2,4})\/(\d{2})\/(\d{2})/);
    const date = (y,m,d) => `${y.length === 2 ? '20'+y : y}-${m}-${d}`;
    const publicParams = {};
    if (/^[1-9]\d?$/.test(pageURL.searchParams.get('app_type') || '') && /^\d{1,8}$/.test(pageURL.searchParams.get('search_flag') || '')) {
      publicParams.appType=Number(pageURL.searchParams.get('app_type')); publicParams.searchFlag=Number(pageURL.searchParams.get('search_flag'));
    } else if (/Industry:\s*Tool\b/.test(document.body?.innerText || '')) {
      // Both public parameters are required by the Tool share URL emitted by BigSpy's Share control.
      publicParams.appType=2; publicParams.searchFlag=145459;
    }
    return {
      provider:'BigSpy', adId, ...publicParams, advertiser:advertiser[0] || '', developer:advertiser[1] || '', adAccount:value('Ad Account'),
      network:value('Platform'), language:value('Language'), region:value('Area').replace(/\s*\(\d+\)\s*$/, ''), dimensions:value('Size'),
      headline:lines[0] || '', adText:lines[1] || '', description:lines[2] || '',
      ...(running ? {runningDays:Number(running[1].replaceAll(',',''))} : {}),
      ...(dates ? {firstSeen:date(...dates.slice(1,4)),lastSeen:date(...dates.slice(4,7))} : {}),
      impressions:value('Impression'), score:value('Total Score'), weekScore:value('Score (This Week)'),
      popularity:text.match(/\bPopularity\s*[:：]?\s*([\d.,]+[KMB]?)/i)?.[1] || '', topPercent:text.match(/\bTop\s*\d+(?:\.\d+)?%/i)?.[0] || '', observedAt:new Date().toISOString()
    };
  }

  globalThis.AdVaultBigSpyAdapter = Object.freeze({get mode() { return mode(); }, rendered, inViewport, mediaSource, mediaIdentity, listingCard, listingKind, findDetails, validateDetails, backgroundDuplicate, eligibleMedia, permissionBlocked, visibleAccessGate, directTarget, findDownload, snapshot, validate, researchData, mediaPlatform, blockedMessage: BLOCKED});
})();
