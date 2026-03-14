/**
 * Track piece renderer — creates Fabric.js objects from TrackData definitions.
 * Each piece is a fabric.Group with custom properties for snap/serialization.
 */

/* eslint-disable no-unused-vars */
const TrackRenderer = (() => {
  const DEG = Math.PI / 180;

  // Visual constants (in mm, scaled to pixels by pxPerMm)
  const RAIL_GAP = 2;      // half-distance between rails
  const TIE_SPACING = 6;   // distance between ties
  const TIE_WIDTH = 5;     // tie width (perpendicular to rail)
  const TIE_THICK = 1.5;   // tie thickness
  const CONN_RADIUS = 2.5; // connection indicator radius
  const RAIL_WIDTH = 1;    // rail line width

  const COLORS = {
    rail: '#c0c0c0',
    tie: '#8b7355',
    connOpen: '#4ecca3',
    connOccupied: '#e74c3c',
    selected: '#ffd700',
    power: '#ff6b6b',
    isolating: '#6b9fff'
  };

  /**
   * Create a Fabric group for a track piece.
   * @param {Object} def - Track piece definition from TrackData
   * @param {number} pxPerMm - Pixel scale factor
   * @returns {fabric.Group}
   */
  function createTrackPiece(def, pxPerMm) {
    const s = pxPerMm;
    const objects = [];

    switch (def.type) {
      case 'straight':
        objects.push(...renderStraight(def, s));
        break;
      case 'curve':
        objects.push(...renderCurve(def, s));
        break;
      case 'turnout':
        objects.push(...renderTurnout(def, s));
        break;
      case 'crossing':
        objects.push(...renderCrossing(def, s));
        break;
      case 's-curve':
        objects.push(...renderSCurve(def, s));
        break;
      case 'buffer':
        objects.push(...renderBuffer(def, s));
        break;
    }

    // Add connection point indicators
    for (let i = 0; i < def.connections.length; i++) {
      const c = def.connections[i];
      objects.push(new fabric.Circle({
        left: c.x * s - CONN_RADIUS * s,
        top: c.y * s - CONN_RADIUS * s,
        radius: CONN_RADIUS * s,
        fill: COLORS.connOpen,
        stroke: null,
        opacity: 0.8,
        selectable: false,
        evented: false,
        connIndex: i
      }));
    }

    const group = new fabric.Group(objects, {
      originX: 'center',
      originY: 'center',
      // Custom properties
      trackId: def.id,
      trackCode: def.code,
      trackType: def.type,
      trackDef: def,
      connStates: def.connections.map(() => 'open'), // 'open' or 'connected'
      subTargetCheck: false,
      hasBorders: true,
      borderColor: COLORS.selected,
      cornerColor: COLORS.selected,
      cornerSize: 12 * s,
      transparentCorners: false,
      padding: 4 * s,
    });

    // Store the bounding-box centre in track-pixel coordinates so that
    // connection-point transforms are not skewed by indicator circles or
    // stroke widths (which inflate group.width/height).
    group._geomOffsetX = group.left;
    group._geomOffsetY = group.top;

    return group;
  }

  // --- Render functions ---

  function renderStraight(def, s) {
    const len = def.length * s;
    const g = RAIL_GAP * s;
    const objects = [];

    // Determine rail color
    let railColor = COLORS.rail;
    if (def.power) railColor = COLORS.power;
    if (def.isolating) railColor = COLORS.isolating;

    // Rails
    objects.push(new fabric.Line([0, -g, len, -g], {
      stroke: railColor, strokeWidth: RAIL_WIDTH * s,
      selectable: false, evented: false
    }));
    objects.push(new fabric.Line([0, g, len, g], {
      stroke: railColor, strokeWidth: RAIL_WIDTH * s,
      selectable: false, evented: false
    }));

    // Ties
    const tieS = TIE_SPACING * s;
    const tieW = TIE_WIDTH * s;
    const tieT = TIE_THICK * s;
    for (let x = tieS / 2; x < len; x += tieS) {
      objects.push(new fabric.Rect({
        left: x - tieT / 2,
        top: -tieW / 2,
        width: tieT,
        height: tieW,
        fill: COLORS.tie,
        selectable: false,
        evented: false
      }));
    }

    // Level crossing bars
    if (def.levelCrossing) {
      const barY = tieW / 2 + 2 * s;
      objects.push(new fabric.Rect({
        left: len * 0.15, top: -barY - 1 * s,
        width: len * 0.7, height: 2 * s,
        fill: '#555', selectable: false, evented: false
      }));
      objects.push(new fabric.Rect({
        left: len * 0.15, top: barY - 1 * s,
        width: len * 0.7, height: 2 * s,
        fill: '#555', selectable: false, evented: false
      }));
    }

    return objects;
  }

  function renderCurve(def, s) {
    const objects = [];
    const r = def.radius * s;
    const g = RAIL_GAP * s;
    const arc = def.arcDeg;
    const steps = Math.max(12, Math.ceil(Math.abs(arc) / 2));

    // Draw rails as polylines (inner and outer)
    for (const offset of [-g, g]) {
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const a = (arc * i / steps) * DEG;
        const cr = r + offset;
        points.push(
          cr * Math.sin(a),
          (r - cr * Math.cos(a))
        );
      }
      const pts = [];
      for (let i = 0; i < points.length; i += 2) {
        pts.push({ x: points[i] * 1, y: points[i + 1] * 1 });
      }
      objects.push(new fabric.Polyline(pts, {
        stroke: COLORS.rail,
        strokeWidth: RAIL_WIDTH * s,
        fill: null,
        selectable: false,
        evented: false
      }));
    }

    // Ties along the curve
    const tieS = TIE_SPACING * s;
    const arcLen = r * Math.abs(arc) * DEG;
    const tieW = TIE_WIDTH * s;
    const tieT = TIE_THICK * s;
    const numTies = Math.floor(arcLen / tieS);
    for (let i = 0; i <= numTies; i++) {
      const a = (arc * (i + 0.5) / (numTies + 1)) * DEG;
      const cx = r * Math.sin(a);
      const cy = r * (1 - Math.cos(a));
      const angle = a; // radial direction

      objects.push(new fabric.Rect({
        left: (cx - tieT / 2 * Math.cos(angle) + tieW / 2 * Math.sin(angle)),
        top: (cy - tieT / 2 * Math.sin(angle) - tieW / 2 * Math.cos(angle)),
        width: tieT,
        height: tieW,
        fill: COLORS.tie,
        angle: (a / DEG),
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false
      }));
    }

    return objects;
  }

  function renderTurnout(def, s) {
    const objects = [];

    // Straight through route
    objects.push(...renderStraight({ length: def.straightLen }, s));

    // Diverging route (curve)
    const r = def.curveRadius * s;
    const g = RAIL_GAP * s;
    const arc = def.hand === 'right' ? -def.arcDeg : def.arcDeg;
    const steps = Math.max(8, Math.ceil(Math.abs(arc) / 2));

    for (const offset of [-g, g]) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = (arc * i / steps) * DEG;
        const cr = r + offset;
        pts.push({
          x: cr * Math.sin(a),
          y: (r - cr * Math.cos(a)) * (def.hand === 'right' ? -1 : 1)
        });
      }
      objects.push(new fabric.Polyline(pts, {
        stroke: COLORS.rail,
        strokeWidth: RAIL_WIDTH * s,
        fill: null,
        selectable: false,
        evented: false
      }));
    }

    return objects;
  }

  function renderCrossing(def, s) {
    const objects = [];

    // Straight route
    objects.push(...renderStraight({ length: def.length }, s));

    // Crossing route
    const len = def.length * s;
    const g = RAIL_GAP * s;
    const a = def.crossAngle * DEG;
    const dx = Math.cos(a);
    const dy = -Math.sin(a);
    const nx = Math.sin(a);
    const ny = Math.cos(a);

    for (const offset of [-g, g]) {
      objects.push(new fabric.Line([
        offset * nx, offset * ny,
        len * dx + offset * nx, len * dy + offset * ny
      ], {
        stroke: COLORS.rail,
        strokeWidth: RAIL_WIDTH * s,
        selectable: false,
        evented: false
      }));
    }

    return objects;
  }

  function renderSCurve(def, s) {
    const objects = [];
    const r = def.radius * s;
    const g = RAIL_GAP * s;
    const arc = def.arcDeg;
    const steps = Math.max(8, Math.ceil(arc / 2));

    // First half: curve left
    for (const offset of [-g, g]) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = (arc * i / steps) * DEG;
        const cr = r + offset;
        pts.push({ x: cr * Math.sin(a), y: r - cr * Math.cos(a) });
      }
      objects.push(new fabric.Polyline(pts, {
        stroke: COLORS.rail, strokeWidth: RAIL_WIDTH * s,
        fill: null, selectable: false, evented: false
      }));
    }

    // Second half: curve right (mirrored)
    const midX = r * Math.sin(arc * DEG);
    const midY = r * (1 - Math.cos(arc * DEG));
    for (const offset of [-g, g]) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = (arc * i / steps) * DEG;
        const cr = r + offset;
        pts.push({
          x: midX + cr * Math.sin(a),
          y: midY - (r - cr * Math.cos(a))
        });
      }
      objects.push(new fabric.Polyline(pts, {
        stroke: COLORS.rail, strokeWidth: RAIL_WIDTH * s,
        fill: null, selectable: false, evented: false
      }));
    }

    // Ties along entire length (simplified)
    const tieS = TIE_SPACING * s;
    const totalLen = 2 * r * arc * DEG;
    const numTies = Math.floor(totalLen / tieS);
    const tieW = TIE_WIDTH * s;
    const tieT = TIE_THICK * s;

    for (let i = 0; i < numTies; i++) {
      const t = (i + 0.5) / numTies;
      // Interpolate along the S-curve
      const conn0 = def.connections[0];
      const conn1 = def.connections[1];
      const tx = conn0.x + (conn1.x - conn0.x) * t;
      const ty = (conn0.y + (conn1.y - conn0.y) * t) * s;
      objects.push(new fabric.Rect({
        left: tx * s,
        top: ty - tieW / 2,
        width: tieT,
        height: tieW,
        fill: COLORS.tie,
        selectable: false,
        evented: false
      }));
    }

    return objects;
  }

  function renderBuffer(def, s) {
    const objects = [];
    const w = 8 * s;
    const h = 6 * s;

    // Short rail stub
    objects.push(new fabric.Line([0, -RAIL_GAP * s, -w, -RAIL_GAP * s], {
      stroke: COLORS.rail, strokeWidth: RAIL_WIDTH * s,
      selectable: false, evented: false
    }));
    objects.push(new fabric.Line([0, RAIL_GAP * s, -w, RAIL_GAP * s], {
      stroke: COLORS.rail, strokeWidth: RAIL_WIDTH * s,
      selectable: false, evented: false
    }));

    // Buffer block
    objects.push(new fabric.Rect({
      left: -w - 3 * s,
      top: -h / 2,
      width: 3 * s,
      height: h,
      fill: '#888',
      selectable: false,
      evented: false
    }));

    return objects;
  }

  /**
   * Create a small preview for the palette
   */
  function createPalettePreview(def, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.strokeStyle = COLORS.rail;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = COLORS.tie;

    const margin = 4;
    const area = size - margin * 2;

    ctx.save();
    ctx.translate(margin, size / 2);

    switch (def.type) {
      case 'straight':
      case 'buffer': {
        ctx.beginPath();
        ctx.moveTo(0, -3); ctx.lineTo(area, -3);
        ctx.moveTo(0, 3); ctx.lineTo(area, 3);
        ctx.stroke();
        // Ties
        for (let x = 4; x < area; x += 8) {
          ctx.fillRect(x, -5, 2, 10);
        }
        if (def.type === 'buffer') {
          ctx.fillStyle = '#888';
          ctx.fillRect(area - 4, -6, 4, 12);
        }
        break;
      }
      case 'curve': {
        const scale = area / (def.radius * (1 - Math.cos(def.arcDeg * DEG)) + 10);
        const r = Math.min(def.radius * scale * 0.4, area * 0.8);
        ctx.translate(0, 0);
        ctx.beginPath();
        ctx.arc(0, -r, r - 3, Math.PI / 2, Math.PI / 2 - def.arcDeg * DEG * 0.8, true);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -r, r + 3, Math.PI / 2, Math.PI / 2 - def.arcDeg * DEG * 0.8, true);
        ctx.stroke();
        break;
      }
      case 'turnout': {
        // Straight
        ctx.beginPath();
        ctx.moveTo(0, -3); ctx.lineTo(area, -3);
        ctx.moveTo(0, 3); ctx.lineTo(area, 3);
        ctx.stroke();
        // Diverging
        const dy = def.hand === 'right' ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(area * 0.5, 0, area * 0.8, dy * area * 0.4);
        ctx.stroke();
        break;
      }
      case 'crossing': {
        ctx.beginPath();
        ctx.moveTo(0, -3); ctx.lineTo(area, -3);
        ctx.moveTo(0, 3); ctx.lineTo(area, 3);
        ctx.stroke();
        // Cross line
        const a = def.crossAngle * DEG;
        ctx.beginPath();
        ctx.moveTo(area * 0.2, -Math.sin(a) * area * 0.3);
        ctx.lineTo(area * 0.8, Math.sin(a) * area * 0.3);
        ctx.stroke();
        break;
      }
      case 's-curve': {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(area * 0.3, -area * 0.3, area * 0.7, area * 0.3, area, 0);
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
    return canvas;
  }

  /**
   * Get world-space connection points for a placed piece.
   * Takes into account position and rotation of the fabric group.
   */
  function getWorldConnections(group) {
    const def = group.trackDef;
    if (!def) return [];
    const cx = group.left;
    const cy = group.top;
    const angle = (group.angle || 0) * DEG;

    return def.connections.map((c, i) => {
      // Use the stored geometry-origin offset (bounding-box centre in track
      // pixel coords) so connection positions are not skewed by indicator
      // circles or stroke widths that inflate group.width/height.
      const offsetX = (group._geomOffsetX !== undefined) ? group._geomOffsetX : group.width / 2;
      const offsetY = (group._geomOffsetY !== undefined) ? group._geomOffsetY : group.height / 2;
      const lx = c.x * group._pxPerMm - offsetX;
      const ly = c.y * group._pxPerMm - offsetY;

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x: cx + lx * cos - ly * sin,
        y: cy + lx * sin + ly * cos,
        angle: c.angle + (group.angle || 0),
        index: i,
        state: group.connStates ? group.connStates[i] : 'open'
      };
    });
  }

  return {
    createTrackPiece,
    createPalettePreview,
    getWorldConnections,
    COLORS
  };
})();
