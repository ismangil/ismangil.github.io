/**
 * Main app — wires together canvas, palette, toolbar, and interactions.
 */

const App = (() => {
  let canvas = null;
  let currentScale = 'T';
  let selectedPaletteItem = null;
  let undoStack = [];
  let redoStack = [];
  const MAX_UNDO = 50;
  let autosaveTimer = null;

  function init() {
    canvas = CanvasManager.init();

    setupPalette();
    setupToolbar();
    setupCanvasEvents();
    setupKeyboard();

    // Try to restore autosave
    const autosave = Storage.loadAutosave();
    if (autosave && autosave.data && autosave.data.objects && autosave.data.objects.length > 0) {
      currentScale = autosave.scale || 'T';
      restoreCanvas(autosave.data);
    }

    updateScaleUI();
    updatePieceCount();
  }

  // === Palette ===

  function setupPalette() {
    populatePalette();
  }

  function populatePalette() {
    const list = document.getElementById('palette-list');
    list.innerHTML = '';

    const groups = TrackData.groupByType(currentScale);
    const typeLabels = {
      straight: 'Straights',
      curve: 'Curves',
      turnout: 'Turnouts',
      crossing: 'Crossings',
      's-curve': 'S-Curves',
      buffer: 'Buffer Stops'
    };

    for (const [type, pieces] of Object.entries(groups)) {
      const section = document.createElement('div');
      section.className = 'palette-section';

      const title = document.createElement('div');
      title.className = 'palette-section-title';
      title.textContent = typeLabels[type] || type;
      section.appendChild(title);

      for (const piece of pieces) {
        const item = document.createElement('div');
        item.className = 'palette-item';
        item.dataset.pieceId = piece.id;

        // Preview icon
        const iconWrap = document.createElement('div');
        iconWrap.className = 'palette-item-icon';
        const preview = TrackRenderer.createPalettePreview(piece, 36);
        iconWrap.appendChild(preview);
        item.appendChild(iconWrap);

        // Label
        const label = document.createElement('div');
        label.className = 'palette-item-label';
        label.textContent = piece.label;
        const codeSpan = document.createElement('div');
        codeSpan.style.fontSize = '10px';
        codeSpan.style.opacity = '0.6';
        codeSpan.textContent = piece.code;
        label.appendChild(codeSpan);
        item.appendChild(label);

        // Click to select
        item.addEventListener('click', () => selectPaletteItem(piece.id, item));
        item.addEventListener('touchend', (e) => {
          e.preventDefault();
          selectPaletteItem(piece.id, item);
        });

        section.appendChild(item);
      }

      list.appendChild(section);
    }
  }

  function selectPaletteItem(pieceId, element) {
    // Deselect previous
    const prev = document.querySelector('.palette-item.selected');
    if (prev) prev.classList.remove('selected');

    if (selectedPaletteItem === pieceId) {
      selectedPaletteItem = null;
      updateHint('Tap a track piece to select it');
      return;
    }

    selectedPaletteItem = pieceId;
    element.classList.add('selected');
    updateHint('Tap the canvas to place the piece');
  }

  // === Canvas Events ===

  function setupCanvasEvents() {
    // Click on canvas to place piece
    canvas.on('mouse:down', (opt) => {
      if (opt.e.altKey || opt.e.button === 1) return; // pan mode
      if (!selectedPaletteItem) return;
      if (opt.target) return; // clicked on existing object

      const pointer = canvas.getPointer(opt.e);
      placeTrackPiece(selectedPaletteItem, pointer.x, pointer.y);
    });

    // Snap on move
    canvas.on('object:moving', (opt) => {
      const obj = opt.target;
      if (!obj.trackDef) return;

      // Disconnect before moving
      SnapEngine.disconnectAll(obj, canvas, CanvasManager.pxPerMm);

      // Find snap
      const snap = SnapEngine.findSnap(obj, canvas, CanvasManager.pxPerMm);
      if (snap) {
        SnapEngine.applySnap(obj, snap, CanvasManager.pxPerMm);
      }
    });

    // Save state after modification
    canvas.on('object:modified', () => {
      saveUndoState();
      scheduleAutosave();
      updatePieceCount();
    });

    // Update on selection
    canvas.on('selection:created', updateHint);
    canvas.on('selection:cleared', () => {
      if (!selectedPaletteItem) {
        updateHint('Tap a track piece to select it');
      }
    });
  }

  function placeTrackPiece(pieceId, x, y) {
    const def = TrackData.getPiece(currentScale, pieceId);
    if (!def) return;

    const pxMm = CanvasManager.pxPerMm;
    const group = TrackRenderer.createTrackPiece(def, pxMm);
    group._pxPerMm = pxMm;

    group.set({ left: x, top: y });
    group.setCoords();

    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    // Try to snap immediately
    const snap = SnapEngine.findSnap(group, canvas, pxMm);
    if (snap) {
      SnapEngine.applySnap(group, snap, pxMm);
      canvas.requestRenderAll();
    }

    saveUndoState();
    scheduleAutosave();
    updatePieceCount();
  }

  // === Toolbar ===

  function setupToolbar() {
    document.getElementById('btn-scale').addEventListener('click', toggleScale);
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-rotate-cw').addEventListener('click', () => rotateSelected(15));
    document.getElementById('btn-rotate-ccw').addEventListener('click', () => rotateSelected(-15));
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-zoom-in').addEventListener('click', () => CanvasManager.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => CanvasManager.zoomOut());
    document.getElementById('btn-zoom-fit').addEventListener('click', () => CanvasManager.zoomToFit());
    document.getElementById('btn-save').addEventListener('click', showSaveModal);
    document.getElementById('btn-load').addEventListener('click', showLoadModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  }

  function toggleScale() {
    // Clear canvas when switching scales
    if (canvas.getObjects().filter(o => o.trackDef).length > 0) {
      if (!confirm('Switching scale will clear the canvas. Continue?')) return;
    }

    currentScale = currentScale === 'T' ? 'N' : 'T';
    canvas.clear();
    undoStack = [];
    redoStack = [];
    updateScaleUI();
    populatePalette();
    updatePieceCount();
    scheduleAutosave();
  }

  function updateScaleUI() {
    const btn = document.getElementById('btn-scale');
    btn.textContent = currentScale;
    document.getElementById('status-scale').textContent = 'Scale: ' + currentScale;
    document.getElementById('palette-title').textContent =
      (currentScale === 'T' ? 'T Gauge' : 'Peco N') + ' Pieces';
  }

  function deleteSelected() {
    const active = canvas.getActiveObject();
    if (!active) return;

    if (active.type === 'activeSelection') {
      // Multiple selection
      active.forEachObject((obj) => {
        if (obj.trackDef) {
          SnapEngine.disconnectAll(obj, canvas, CanvasManager.pxPerMm);
        }
        canvas.remove(obj);
      });
      canvas.discardActiveObject();
    } else {
      if (active.trackDef) {
        SnapEngine.disconnectAll(active, canvas, CanvasManager.pxPerMm);
      }
      canvas.remove(active);
    }

    canvas.requestRenderAll();
    saveUndoState();
    scheduleAutosave();
    updatePieceCount();
  }

  function rotateSelected(degrees) {
    const active = canvas.getActiveObject();
    if (!active) return;

    if (active.trackDef) {
      SnapEngine.disconnectAll(active, canvas, CanvasManager.pxPerMm);
    }

    active.rotate((active.angle || 0) + degrees);
    active.setCoords();

    // Try to snap after rotation
    if (active.trackDef) {
      const snap = SnapEngine.findSnap(active, canvas, CanvasManager.pxPerMm);
      if (snap) {
        SnapEngine.applySnap(active, snap, CanvasManager.pxPerMm);
      }
    }

    canvas.requestRenderAll();
    saveUndoState();
    scheduleAutosave();
  }

  // === Undo/Redo ===

  function saveUndoState() {
    const state = canvas.toJSON([
      'trackId', 'trackCode', 'trackType', 'trackDef',
      'connStates', '_pxPerMm'
    ]);
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
  }

  function undo() {
    if (undoStack.length < 2) return;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    restoreCanvas(JSON.parse(prev));
    updateUndoButtons();
    scheduleAutosave();
    updatePieceCount();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    undoStack.push(next);
    restoreCanvas(JSON.parse(next));
    updateUndoButtons();
    scheduleAutosave();
    updatePieceCount();
  }

  function updateUndoButtons() {
    document.getElementById('btn-undo').disabled = undoStack.length < 2;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
  }

  async function restoreCanvas(data) {
    await canvas.loadFromJSON(data);
    canvas.requestRenderAll();
  }

  // === Save/Load Modal ===

  function showSaveModal() {
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = 'Save Layout';
    body.innerHTML = '';

    // Name input
    const input = document.createElement('input');
    input.className = 'modal-input';
    input.placeholder = 'Layout name...';
    input.value = 'My Layout ' + (Storage.listLayouts().length + 1);
    body.appendChild(input);

    // Save button
    const btn = document.createElement('button');
    btn.className = 'modal-btn modal-btn-primary';
    btn.textContent = 'Save';
    btn.style.width = '100%';
    btn.addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) return;
      Storage.saveLayout(canvas, name, currentScale);
      closeModal();
      updateHint('Layout saved: ' + name);
    });
    body.appendChild(btn);

    // Existing saves
    const saves = Storage.listLayouts();
    if (saves.length > 0) {
      const hr = document.createElement('hr');
      hr.style.margin = '16px 0';
      hr.style.border = 'none';
      hr.style.borderTop = '1px solid #0f3460';
      body.appendChild(hr);

      const subtitle = document.createElement('div');
      subtitle.style.fontSize = '12px';
      subtitle.style.color = '#a0a0b0';
      subtitle.style.marginBottom = '8px';
      subtitle.textContent = 'Overwrite existing:';
      body.appendChild(subtitle);

      for (const save of saves) {
        const slot = document.createElement('div');
        slot.className = 'modal-slot';
        slot.innerHTML = `
          <div>
            <div class="modal-slot-name">${escapeHtml(save.name)}</div>
            <div class="modal-slot-info">${save.scale} scale, ${save.pieceCount} pieces</div>
          </div>
        `;
        slot.addEventListener('click', () => {
          input.value = save.name;
        });
        body.appendChild(slot);
      }
    }

    modal.classList.remove('hidden');
    input.focus();
  }

  function showLoadModal() {
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = 'Load Layout';
    body.innerHTML = '';

    const saves = Storage.listLayouts();
    if (saves.length === 0) {
      body.innerHTML = '<p style="color: #a0a0b0; text-align: center; padding: 20px;">No saved layouts</p>';
      modal.classList.remove('hidden');
      return;
    }

    for (const save of saves) {
      const slot = document.createElement('div');
      slot.className = 'modal-slot';

      const info = document.createElement('div');
      info.innerHTML = `
        <div class="modal-slot-name">${escapeHtml(save.name)}</div>
        <div class="modal-slot-info">${save.scale} scale, ${save.pieceCount} pieces &middot; ${formatDate(save.date)}</div>
      `;
      slot.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'modal-slot-actions';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'modal-btn modal-btn-primary';
      loadBtn.textContent = 'Load';
      loadBtn.style.padding = '6px 14px';
      loadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const layout = Storage.loadLayout(save.name);
        if (layout) {
          currentScale = layout.scale || 'T';
          updateScaleUI();
          populatePalette();
          restoreCanvas(layout.data);
          updatePieceCount();
          closeModal();
          updateHint('Loaded: ' + save.name);
        }
      });
      actions.appendChild(loadBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'modal-btn modal-btn-danger';
      delBtn.textContent = 'Del';
      delBtn.style.padding = '6px 14px';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete "' + save.name + '"?')) {
          Storage.deleteLayout(save.name);
          showLoadModal(); // refresh
        }
      });
      actions.appendChild(delBtn);

      slot.appendChild(actions);
      body.appendChild(slot);
    }

    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // === Keyboard ===

  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't handle when typing in input
      if (e.target.tagName === 'INPUT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
                 (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        showSaveModal();
      } else if (e.key === 'r' || e.key === ']') {
        rotateSelected(15);
      } else if (e.key === 'R' || e.key === '[') {
        rotateSelected(-15);
      } else if (e.key === 'Escape') {
        selectedPaletteItem = null;
        const prev = document.querySelector('.palette-item.selected');
        if (prev) prev.classList.remove('selected');
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        updateHint('Tap a track piece to select it');
      }
    });
  }

  // === Helpers ===

  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      Storage.autosave(canvas, currentScale);
    }, 1000);
  }

  function updatePieceCount() {
    const count = canvas ? canvas.getObjects().filter(o => o.trackDef).length : 0;
    document.getElementById('status-pieces').textContent = 'Pieces: ' + count;
  }

  function updateHint(text) {
    const el = document.getElementById('status-hint');
    if (typeof text === 'string') {
      el.textContent = text;
    } else {
      // selection event
      const active = canvas.getActiveObject();
      if (active && active.trackDef) {
        el.textContent = active.trackDef.label + ' [' + active.trackDef.code + '] — Drag to move, R/[ to rotate';
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, toggleScale, deleteSelected };
})();
