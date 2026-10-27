// Runs in the extension's isolated world, including pages left open during an update.
export function syncCaptureFrame(enabled) {
  if (window.top !== window && !(location.hostname === 'adstransparency.google.com' && location.pathname.startsWith('/adframe'))) return false;
  if (globalThis.__pikkoCaptureControl) {
    globalThis.__pikkoCaptureControl(enabled);
    return false;
  }
  // Old extension worlds cannot receive storage events after a reload. Hide the
  // actual host too: an old observer may reattach it after it is removed.
  for (const root of document.querySelectorAll('#ad-vault-v2-capture-root')) {
    root.style.setProperty('display', 'none', 'important');
    root.removeAttribute('id');
    root.remove();
  }
  return true;
}

export async function syncCaptureTabs(enabled) {
  const tabs = await chrome.tabs.query({});
  const results = await Promise.all(tabs.filter(tab => tab.id != null && (!tab.url || /^https?:/.test(tab.url))).map(async tab => {
    try {
      const target = {tabId: tab.id};
      const frames = await chrome.scripting.executeScript({target, func: syncCaptureFrame, args: [enabled]});
      if (frames.some(frame => frame.result)) {
        await chrome.scripting.executeScript({target, files: ['adapter.js', 'content.js']});
      }
      // Google previews can be embedded in permitted adframe documents. Keep
      // other third-party frames untouched, as in the manifest's match rules.
      try {
        const embedded = await chrome.scripting.executeScript({target: {...target, allFrames: true}, func: syncCaptureFrame, args: [enabled]});
        const frameIds = embedded.filter(frame => frame.frameId > 0 && frame.result).map(frame => frame.frameId);
        if (frameIds.length) await chrome.scripting.executeScript({target: {...target, frameIds}, files: ['adapter.js', 'content.js']});
      } catch { /* Frames without a host grant are not injected. */ }
      return {tabId: tab.id, ok: true};
    } catch {
      // Older tabs without a host grant need a refresh; current scripts still
      // receive the preference through storage.onChanged without injection.
      return {tabId: tab.id, ok: false, active: tab.active};
    }
  }));
  return results;
}
