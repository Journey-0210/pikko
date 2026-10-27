export function constrainView(view, media, viewport) {
  const scale = Math.max(1, Math.min(6, view.scale));
  const limitX = Math.max(0, (media.width * scale - viewport.width) / 2);
  const limitY = Math.max(0, (media.height * scale - viewport.height) / 2);
  return { scale, x: limitX ? Math.max(-limitX, Math.min(limitX, view.x)) : 0, y: limitY ? Math.max(-limitY, Math.min(limitY, view.y)) : 0 };
}

export function zoomView(view, scale, point, media, viewport) {
  const nextScale = Math.max(1, Math.min(6, scale));
  const ratio = nextScale / view.scale;
  return constrainView({ scale: nextScale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, media, viewport);
}

export function setupMediaViewer(stage, toolbar, dialog) {
  let media = null;
  let view = { scale: 1, x: 0, y: 0 };
  let fitted = { width: 0, height: 0 };
  let drag = null;
  let suppressClick = false;
  const output = toolbar.querySelector('output');
  const expandButton = toolbar.querySelector('[data-viewer="expand"]');
  const viewport = () => ({ width: stage.clientWidth, height: stage.clientHeight });

  function render() {
    if (!media) return;
    const width = media.videoWidth || media.naturalWidth;
    const height = media.videoHeight || media.naturalHeight;
    if (!width || !height || !stage.clientWidth || !stage.clientHeight) return;
    const size = viewport();
    const fit = Math.min(size.width / width, size.height / height);
    fitted = { width: width * fit, height: height * fit };
    view = constrainView(view, fitted, size);
    media.style.width = `${fitted.width}px`;
    media.style.height = `${fitted.height}px`;
    media.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    stage.classList.toggle('can-pan', view.scale > 1);
    output.value = `${Math.round(view.scale * 100)}%`;
    toolbar.querySelector('[data-viewer="out"]').disabled = view.scale === 1;
    toolbar.querySelector('[data-viewer="in"]').disabled = view.scale === 6;
    toolbar.hidden = false;
  }
  function reset() { view = { scale: 1, x: 0, y: 0 }; render(); }
  function zoom(scale, point = { x: 0, y: 0 }) {
    if (!media || !fitted.width) return;
    view = zoomView(view, scale, point, fitted, viewport()); render();
  }
  function expand(value = !dialog.classList.contains('preview-expanded')) {
    dialog.classList.toggle('preview-expanded', value);
    expandButton.textContent = value ? '返回详情' : '放大查看';
    expandButton.setAttribute('aria-expanded', String(value));
    reset();
  }
  toolbar.addEventListener('click', event => {
    const action = event.target.closest('button')?.dataset.viewer;
    if (action === 'in') zoom(view.scale * 1.25);
    if (action === 'out') zoom(view.scale / 1.25);
    if (action === 'reset') reset();
    if (action === 'expand') expand();
  });
  stage.addEventListener('wheel', event => {
    if (!media || !fitted.width) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoom(view.scale * Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.002), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
  }, { passive: false });
  stage.addEventListener('pointerdown', event => {
    suppressClick = false;
    if (!media || view.scale === 1 || event.button !== 0) return;
    // Leave the native video control strip clickable whenever it is visible.
    if (media.tagName === 'VIDEO' && event.clientY > media.getBoundingClientRect().bottom - 52) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...view } };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) suppressClick = true;
    view = constrainView({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }, fitted, viewport());
    render();
  });
  function stopDrag() { drag = null; stage.classList.remove('is-panning'); }
  stage.addEventListener('pointerup', event => {
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    stopDrag();
  });
  stage.addEventListener('lostpointercapture', stopDrag);
  stage.addEventListener('pointercancel', stopDrag);
  stage.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } }, true);
  stage.addEventListener('keydown', event => {
    if (event.target !== stage || !media) return;
    if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
    if (event.key === '+' || event.key === '=') zoom(view.scale * 1.25);
    if (event.key === '-') zoom(view.scale / 1.25);
    if (event.key === '0') reset();
    const movement = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
    if (movement) { view = constrainView({ ...view, x: view.x + movement[0], y: view.y + movement[1] }, fitted, viewport()); render(); }
  });
  new ResizeObserver(render).observe(stage);
  return {
    setMedia(node) {
      media = node; media.draggable = false; reset();
      media.addEventListener(media.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', () => { if (media === node) render(); }, { once: true });
    },
    clear() {
      media = null; fitted = { width: 0, height: 0 }; view = { scale: 1, x: 0, y: 0 };
      if (drag && stage.hasPointerCapture(drag.id)) stage.releasePointerCapture(drag.id);
      stopDrag(); suppressClick = false; toolbar.hidden = true;
      stage.classList.remove('can-pan'); expand(false);
    },
    collapse() { if (!dialog.classList.contains('preview-expanded')) return false; expand(false); return true; }
  };
}
