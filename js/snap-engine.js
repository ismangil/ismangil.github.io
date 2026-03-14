/**
 * Snap-to-connect engine.
 * Finds nearby open connection points and snaps moving pieces into alignment.
 */

/* eslint-disable no-unused-vars */
const SnapEngine = (() => {
  const DEG = Math.PI / 180;
  const SNAP_DISTANCE = 20; // pixels — max distance to trigger snap
  const ANGLE_TOLERANCE = 5; // degrees — tolerance for angle matching

  /**
   * Attempt to snap a moving group to nearby connection points.
   * @param {fabric.Group} movingGroup - The piece being dragged
   * @param {fabric.Canvas} canvas - The Fabric canvas
   * @param {number} pxPerMm - Current pixel scale
   * @returns {Object|null} Snap result with position/angle adjustments, or null
   */
  function findSnap(movingGroup, canvas, pxPerMm) {
    const movingDef = movingGroup.trackDef;
    if (!movingDef) return null;

    const movingConns = getWorldConns(movingGroup, pxPerMm);
    let bestSnap = null;
    let bestDist = SNAP_DISTANCE;

    // Check all other track pieces on canvas
    const objects = canvas.getObjects();
    for (const obj of objects) {
      if (obj === movingGroup || !obj.trackDef) continue;

      const targetConns = getWorldConns(obj, pxPerMm);

      for (const mc of movingConns) {
        if (mc.state === 'connected') continue;

        for (const tc of targetConns) {
          if (tc.state === 'connected') continue;

          const dx = mc.x - tc.x;
          const dy = mc.y - tc.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < bestDist) {
            // Check angle compatibility: connection angles should differ by ~180°
            const angleDiff = normalizeAngle(mc.angle - tc.angle);
            if (Math.abs(angleDiff - 180) < ANGLE_TOLERANCE || Math.abs(angleDiff + 180) < ANGLE_TOLERANCE) {
              bestDist = dist;
              bestSnap = {
                movingConnIndex: mc.index,
                targetGroup: obj,
                targetConnIndex: tc.index,
                targetPoint: { x: tc.x, y: tc.y },
                movingPoint: { x: mc.x, y: mc.y },
                distance: dist
              };
            }
          }
        }
      }
    }

    return bestSnap;
  }

  /**
   * Apply a snap — move and optionally rotate the piece so connections align.
   */
  function applySnap(movingGroup, snapResult, pxPerMm) {
    if (!snapResult) return;

    // Simply translate the moving piece so the connection points coincide
    const dx = snapResult.targetPoint.x - snapResult.movingPoint.x;
    const dy = snapResult.targetPoint.y - snapResult.movingPoint.y;

    movingGroup.set({
      left: movingGroup.left + dx,
      top: movingGroup.top + dy
    });
    movingGroup.setCoords();

    // Mark connections as connected
    if (movingGroup.connStates) {
      movingGroup.connStates[snapResult.movingConnIndex] = 'connected';
    }
    if (snapResult.targetGroup.connStates) {
      snapResult.targetGroup.connStates[snapResult.targetConnIndex] = 'connected';
    }

    // Update connection indicator colors
    updateConnIndicators(movingGroup);
    updateConnIndicators(snapResult.targetGroup);
  }

  /**
   * Disconnect all connections involving a group (e.g., when deleting or moving).
   */
  function disconnectAll(group, canvas, pxPerMm) {
    if (!group.trackDef || !group.connStates) return;

    const myConns = getWorldConns(group, pxPerMm);

    // Find and disconnect any connected neighbors
    for (const obj of canvas.getObjects()) {
      if (obj === group || !obj.trackDef || !obj.connStates) continue;

      const theirConns = getWorldConns(obj, pxPerMm);
      for (const mc of myConns) {
        for (const tc of theirConns) {
          const dx = mc.x - tc.x;
          const dy = mc.y - tc.y;
          if (Math.sqrt(dx * dx + dy * dy) < 3) { // very close = connected
            obj.connStates[tc.index] = 'open';
            updateConnIndicators(obj);
          }
        }
      }
    }

    // Reset own connections
    group.connStates = group.connStates.map(() => 'open');
    updateConnIndicators(group);
  }

  // --- Internal helpers ---

  function getWorldConns(group, pxPerMm) {
    const def = group.trackDef;
    if (!def) return [];
    const cx = group.left;
    const cy = group.top;
    const angle = (group.angle || 0) * DEG;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Get the group's internal dimensions to find center offset
    const w = group.width;
    const h = group.height;

    return def.connections.map((c, i) => {
      const lx = c.x * pxPerMm - w / 2;
      const ly = c.y * pxPerMm - h / 2;
      return {
        x: cx + lx * cos - ly * sin,
        y: cy + lx * sin + ly * cos,
        angle: c.angle + (group.angle || 0),
        index: i,
        state: group.connStates ? group.connStates[i] : 'open'
      };
    });
  }

  function normalizeAngle(a) {
    a = a % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  }

  function updateConnIndicators(group) {
    if (!group._objects || !group.connStates) return;
    let connIdx = 0;
    for (const obj of group._objects) {
      if (obj.connIndex !== undefined) {
        const state = group.connStates[obj.connIndex];
        obj.set('fill', state === 'connected'
          ? TrackRenderer.COLORS.connOccupied
          : TrackRenderer.COLORS.connOpen
        );
        connIdx++;
      }
    }
  }

  return {
    findSnap,
    applySnap,
    disconnectAll,
    SNAP_DISTANCE
  };
})();
