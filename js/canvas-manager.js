/**
 * Canvas manager — handles Fabric canvas initialization, zoom, pan, and grid.
 */

/* eslint-disable no-unused-vars */
const CanvasManager = (() => {
  let canvas = null;
  let pxPerMm = 2;          // default scale factor
  let zoomLevel = 1;
  let isPanning = false;
  let lastPanX = 0;
  let lastPanY = 0;
  let gridSize = 10;         // mm between grid lines

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4;

  /**
   * Initialize the Fabric canvas.
   * @returns {fabric.Canvas}
   */
  function init() {
    const container = document.getElementById('canvas-area');
    const canvasEl = document.getElementById('layout-canvas');

    // Size canvas to container
    const rect = container.getBoundingClientRect();
    canvasEl.width = rect.width;
    canvasEl.height = rect.height;

    canvas = new fabric.Canvas('layout-canvas', {
      backgroundColor: '#1a1a2e',
      selection: true,
      selectionColor: 'rgba(78, 204, 163, 0.15)',
      selectionBorderColor: '#4ecca3',
      selectionLineWidth: 1,
      preserveObjectStacking: true,
      allowTouchScrolling: false,
      enableRetinaScaling: true,
    });

    setupGrid();
    setupZoomPan();
    setupResize(container);

    return canvas;
  }

  function getCanvas() { return canvas; }
  function getPxPerMm() { return pxPerMm * zoomLevel; }
  function getZoom() { return zoomLevel; }

  function setZoom(newZoom, centerX, centerY) {
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    if (newZoom === zoomLevel) return;

    // If center point provided, zoom towards that point
    if (centerX !== undefined && centerY !== undefined) {
      const point = new fabric.Point(centerX, centerY);
      canvas.zoomToPoint(point, newZoom);
    } else {
      // Zoom to center of canvas
      const center = canvas.getCenter();
      canvas.zoomToPoint(new fabric.Point(center.left, center.top), newZoom);
    }

    zoomLevel = newZoom;
    updateGrid();
    updateStatus();
  }

  function zoomIn() { setZoom(zoomLevel * 1.25); }
  function zoomOut() { setZoom(zoomLevel / 1.25); }

  function zoomToFit() {
    const objects = canvas.getObjects().filter(o => o.trackDef);
    if (objects.length === 0) {
      setZoom(1);
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      return;
    }

    // Get bounding box of all track objects
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
      const br = obj.getBoundingRect();
      minX = Math.min(minX, br.left);
      minY = Math.min(minY, br.top);
      maxX = Math.max(maxX, br.left + br.width);
      maxY = Math.max(maxY, br.top + br.height);
    }

    const padding = 40;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const scaleX = canvas.width / contentW;
    const scaleY = canvas.height / contentH;
    const newZoom = Math.min(scaleX, scaleY, MAX_ZOOM);

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    canvas.setViewportTransform([
      newZoom, 0, 0, newZoom,
      canvas.width / 2 - centerX * newZoom,
      canvas.height / 2 - centerY * newZoom
    ]);
    zoomLevel = newZoom;
    updateStatus();
  }

  // --- Grid ---

  function setupGrid() {
    updateGrid();
  }

  function updateGrid() {
    // We draw the grid as the canvas background using a pattern
    const gridPx = gridSize * pxPerMm * zoomLevel;

    // Only draw grid if grid lines aren't too close together
    if (gridPx < 8) {
      canvas.set('backgroundColor', '#1a1a2e');
      canvas.requestRenderAll();
      return;
    }

    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = gridPx;
    gridCanvas.height = gridPx;
    const ctx = gridCanvas.getContext('2d');

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, gridPx, gridPx);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(gridPx, 0);
    ctx.lineTo(gridPx, gridPx);
    ctx.moveTo(0, gridPx);
    ctx.lineTo(gridPx, gridPx);
    ctx.stroke();

    // Use a repeating pattern for the background
    canvas.set('backgroundColor', new fabric.Pattern({
      source: gridCanvas,
      repeat: 'repeat'
    }));
    canvas.requestRenderAll();
  }

  // --- Zoom & Pan ---

  function setupZoomPan() {
    // Mouse wheel zoom
    canvas.on('mouse:wheel', (opt) => {
      const evt = opt.e;
      evt.preventDefault();
      evt.stopPropagation();

      const delta = evt.deltaY;
      const factor = delta > 0 ? 0.9 : 1.1;
      setZoom(zoomLevel * factor, evt.offsetX, evt.offsetY);
    });

    // Pan with middle mouse or Alt+drag
    canvas.on('mouse:down', (opt) => {
      const evt = opt.e;
      if (evt.altKey || evt.button === 1) {
        isPanning = true;
        lastPanX = evt.clientX;
        lastPanY = evt.clientY;
        canvas.selection = false;
        canvas.setCursor('grabbing');
      }
    });

    canvas.on('mouse:move', (opt) => {
      if (!isPanning) return;
      const evt = opt.e;
      const vpt = canvas.viewportTransform;
      vpt[4] += evt.clientX - lastPanX;
      vpt[5] += evt.clientY - lastPanY;
      lastPanX = evt.clientX;
      lastPanY = evt.clientY;
      canvas.requestRenderAll();
    });

    canvas.on('mouse:up', () => {
      if (isPanning) {
        isPanning = false;
        canvas.selection = true;
        canvas.setCursor('default');
      }
    });

    // Touch: pinch-to-zoom and two-finger pan
    setupTouchGestures();
  }

  function setupTouchGestures() {
    const canvasEl = canvas.upperCanvasEl || canvas.getElement();
    let touches = [];
    let initialDist = 0;
    let initialZoom = 1;
    let initialMidX = 0;
    let initialMidY = 0;
    let initialVPT = null;

    canvasEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touches = Array.from(e.touches);
        initialDist = getTouchDist(touches);
        initialZoom = zoomLevel;
        initialMidX = (touches[0].clientX + touches[1].clientX) / 2;
        initialMidY = (touches[0].clientY + touches[1].clientY) / 2;
        initialVPT = [...canvas.viewportTransform];
        canvas.selection = false;
      }
    }, { passive: false });

    canvasEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const currentTouches = Array.from(e.touches);
        const currentDist = getTouchDist(currentTouches);
        const currentMidX = (currentTouches[0].clientX + currentTouches[1].clientX) / 2;
        const currentMidY = (currentTouches[0].clientY + currentTouches[1].clientY) / 2;

        // Zoom
        const scale = currentDist / initialDist;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialZoom * scale));

        // Pan
        const panDx = currentMidX - initialMidX;
        const panDy = currentMidY - initialMidY;

        const vpt = [...initialVPT];
        const zoomRatio = newZoom / initialZoom;
        vpt[0] = newZoom;
        vpt[3] = newZoom;
        vpt[4] = initialVPT[4] * zoomRatio + panDx;
        vpt[5] = initialVPT[5] * zoomRatio + panDy;

        canvas.setViewportTransform(vpt);
        zoomLevel = newZoom;
        updateStatus();
      }
    }, { passive: false });

    canvasEl.addEventListener('touchend', () => {
      touches = [];
      canvas.selection = true;
      updateGrid();
    });
  }

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // --- Resize ---

  function setupResize(container) {
    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.setWidth(rect.width);
      canvas.setHeight(rect.height);
      canvas.requestRenderAll();
    });
    resizeObserver.observe(container);
  }

  // --- Status updates ---

  function updateStatus() {
    const zoomEl = document.getElementById('zoom-level');
    const statusZoom = document.getElementById('status-zoom');
    const pct = Math.round(zoomLevel * 100) + '%';
    if (zoomEl) zoomEl.textContent = pct;
    if (statusZoom) statusZoom.textContent = 'Zoom: ' + pct;
  }

  return {
    init,
    getCanvas,
    getPxPerMm,
    getZoom,
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    get pxPerMm() { return pxPerMm; }
  };
})();
