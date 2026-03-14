/**
 * Save/Load layouts to localStorage.
 */

/* eslint-disable no-unused-vars */
const Storage = (() => {
  const STORAGE_KEY = 'rail-layout-saves';
  const AUTOSAVE_KEY = 'rail-layout-autosave';
  const MAX_SLOTS = 10;

  function getSaves() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function setSaves(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * Save current canvas state to a named slot.
   */
  function saveLayout(canvas, name, scale) {
    const data = canvas.toJSON([
      'trackId', 'trackCode', 'trackType', 'trackDef',
      'connStates', '_pxPerMm', 'connIndex', '_geomOffsetX', '_geomOffsetY'
    ]);
    const saves = getSaves();
    saves[name] = {
      data,
      scale,
      date: new Date().toISOString(),
      pieceCount: canvas.getObjects().filter(o => o.trackDef).length
    };
    setSaves(saves);
  }

  /**
   * Load a layout from a named slot.
   * Returns { data, scale } or null.
   */
  function loadLayout(name) {
    const saves = getSaves();
    return saves[name] || null;
  }

  /**
   * Delete a saved layout.
   */
  function deleteLayout(name) {
    const saves = getSaves();
    delete saves[name];
    setSaves(saves);
  }

  /**
   * Get list of all saved layouts.
   * Returns array of { name, date, pieceCount, scale }.
   */
  function listLayouts() {
    const saves = getSaves();
    return Object.entries(saves).map(([name, info]) => ({
      name,
      date: info.date,
      pieceCount: info.pieceCount || 0,
      scale: info.scale || '?'
    })).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /**
   * Autosave (called frequently).
   */
  function autosave(canvas, scale) {
    try {
      const data = canvas.toJSON([
        'trackId', 'trackCode', 'trackType', 'trackDef',
        'connStates', '_pxPerMm', 'connIndex', '_geomOffsetX', '_geomOffsetY'
      ]);
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ data, scale }));
    } catch {
      // localStorage might be full
    }
  }

  /**
   * Load autosave if available.
   */
  function loadAutosave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  return {
    saveLayout,
    loadLayout,
    deleteLayout,
    listLayouts,
    autosave,
    loadAutosave,
    MAX_SLOTS
  };
})();
