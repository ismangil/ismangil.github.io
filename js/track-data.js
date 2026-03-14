/**
 * Track piece definitions for T gauge and Peco Setrack N scale.
 * All dimensions in mm (real-world). Pixel conversion handled by canvas-manager.
 *
 * Connection points use local coordinates relative to piece origin.
 * angle = direction a connecting piece would face (outward normal).
 */

/* eslint-disable no-unused-vars */
const TrackData = (() => {
  const DEG = Math.PI / 180;

  // --- Helpers to compute curve endpoint ---
  // Curve starts at (0,0) heading right (0°).
  // Center of curvature is at (0, -radius) for a left-bending curve.
  // For a right-bending curve the center is at (0, +radius).
  // Convention: positive arcAngle = curves to the left (CCW on screen).
  function curveEndpoint(radius, arcDeg) {
    const a = arcDeg * DEG;
    return {
      x: radius * Math.sin(a),
      y: radius * (1 - Math.cos(a)),
      angle: -arcDeg // outward angle at end relative to start direction
    };
  }

  // Build a straight track definition
  function straight(id, code, label, length, opts = {}) {
    return {
      id, code, label, length,
      type: 'straight',
      connections: [
        { x: 0, y: 0, angle: 180 },
        { x: length, y: 0, angle: 0 }
      ],
      ...opts
    };
  }

  // Build a curve track definition
  function curve(id, code, label, radius, arcDeg, opts = {}) {
    const end = curveEndpoint(radius, arcDeg);
    return {
      id, code, label, radius, arcDeg,
      type: 'curve',
      connections: [
        { x: 0, y: 0, angle: 180 },
        { x: end.x, y: end.y, angle: end.angle }
      ],
      ...opts
    };
  }

  // Build a turnout (3 connection points)
  function turnout(id, code, label, straightLen, curveRadius, arcDeg, hand, opts = {}) {
    const end = curveEndpoint(curveRadius, hand === 'right' ? -arcDeg : arcDeg);
    return {
      id, code, label,
      type: 'turnout',
      hand,
      straightLen,
      curveRadius,
      arcDeg,
      connections: [
        { x: 0, y: 0, angle: 180 },                          // entry
        { x: straightLen, y: 0, angle: 0 },                    // straight exit
        { x: end.x, y: end.y, angle: hand === 'right' ? arcDeg : -arcDeg } // diverging exit
      ],
      ...opts
    };
  }

  // Build a crossing (4 connection points)
  function crossing(id, code, label, length, crossAngle, opts = {}) {
    const a = crossAngle * DEG;
    const cx = length * Math.cos(a);
    const cy = length * Math.sin(a);
    return {
      id, code, label,
      type: 'crossing',
      length,
      crossAngle,
      connections: [
        { x: 0, y: 0, angle: 180 },                     // straight entry
        { x: length, y: 0, angle: 0 },                   // straight exit
        { x: 0, y: 0, angle: 180 + crossAngle },         // cross entry
        { x: cx, y: -cy, angle: crossAngle }              // cross exit
      ],
      ...opts
    };
  }

  // Build a buffer stop (1 connection)
  function bufferStop(id, code, label, opts = {}) {
    return {
      id, code, label,
      type: 'buffer',
      connections: [
        { x: 0, y: 0, angle: 180 }
      ],
      ...opts
    };
  }

  // Build an S-curve (reverse curve, 2 connections)
  function sCurve(id, code, label, radius, arcDeg, opts = {}) {
    // First curve goes left, second goes right (or vice versa)
    const end1 = curveEndpoint(radius, arcDeg);
    const end2 = curveEndpoint(radius, -arcDeg);
    return {
      id, code, label,
      type: 's-curve',
      radius, arcDeg,
      connections: [
        { x: 0, y: 0, angle: 180 },
        { x: end1.x + end2.x, y: end1.y + end2.y, angle: 0 }
      ],
      ...opts
    };
  }

  // =========================================================================
  // T GAUGE (1:450, 3mm track gauge)
  // Source: tgauge.com catalog
  // =========================================================================
  const T_GAUGE = {
    name: 'T Gauge',
    ratio: '1:450',
    trackGauge: 3, // mm
    pieces: [
      // --- Straights ---
      straight('t-str-30', 'R-012', '30mm Straight', 30),
      straight('t-str-60', 'R-003', '60mm Straight', 60),
      straight('t-str-120', 'R-023', '120mm Straight', 120),
      straight('t-pwr-30', 'R-036', '30mm Power', 30, { power: true }),
      straight('t-pwr-60', 'R-022', '60mm Power', 60, { power: true }),
      straight('t-iso-30', 'R-030', '30mm Isolating', 30, { isolating: true }),

      // --- Curves R120mm ---
      curve('t-r120-15', 'R-013', 'R120 15°', 120, 15),
      curve('t-r120-30', 'R-004', 'R120 30°', 120, 30),

      // --- Curves R132.5mm ---
      curve('t-r132-15', 'R-014', 'R132.5 15°', 132.5, 15),
      curve('t-r132-30', 'R-005', 'R132.5 30°', 132.5, 30),

      // --- Curves R145mm ---
      curve('t-r145-15', 'R-015', 'R145 15°', 145, 15),
      curve('t-r145-30', 'R-006', 'R145 30°', 145, 30),

      // --- Curves R157.5mm ---
      curve('t-r157-15', 'R-016', 'R157.5 15°', 157.5, 15),
      curve('t-r157-30', 'R-007', 'R157.5 30°', 157.5, 30),

      // --- Turnouts ---
      // T gauge turnouts diverge at ~15° over a curve
      turnout('t-turn-r', 'R-017', 'Right Turnout', 60, 120, 15, 'right'),
      turnout('t-turn-l', 'R-027', 'Left Turnout', 60, 120, 15, 'left'),
      turnout('t-turn-1w-r', 'R-032', 'Right 1-Way', 60, 120, 15, 'right'),
      turnout('t-turn-1w-l', 'R-033', 'Left 1-Way', 60, 120, 15, 'left'),

      // --- S-Curve ---
      sCurve('t-s-curve', 'R-018', 'S Curve', 120, 15),

      // --- Crossings ---
      crossing('t-cross-30', 'R-029', '30° Crossing', 60, 30),
      crossing('t-cross-90', 'R-019', '90° Crossing', 60, 90),

      // --- Buffer ---
      bufferStop('t-buffer', 'R-100', 'Buffer Stop'),
    ]
  };

  // =========================================================================
  // PECO SETRACK N (Code 80, 1:160, 9mm track gauge)
  // Source: Peco Setrack N official catalog
  // All curves: 16 standard pieces = full circle (22.5° each)
  // =========================================================================
  const PECO_N = {
    name: 'Peco Setrack N',
    ratio: '1:160',
    trackGauge: 9, // mm
    pieces: [
      // --- Straights ---
      straight('n-str-87', 'ST-1', '87mm Standard', 87),
      straight('n-str-58', 'ST-2', '58mm Short', 58),
      straight('n-str-174', 'ST-11', '174mm Double', 174),
      straight('n-pwr-87', 'ST-10', '87mm Power', 87, { power: true }),

      // --- 1st Radius Curves (R228mm) ---
      curve('n-r228-22', 'ST-3', 'R1 22.5°', 228, 22.5),
      curve('n-r228-45', 'ST-12', 'R1 45° Double', 228, 45),
      curve('n-r228-11', 'ST-4', 'R1 11.25° Half', 228, 11.25),

      // --- 2nd Radius Curves (R263.5mm) ---
      curve('n-r263-22', 'ST-14', 'R2 22.5°', 263.5, 22.5),
      curve('n-r263-45', 'ST-15', 'R2 45° Double', 263.5, 45),

      // --- 3rd Radius Curves (R298.5mm) ---
      curve('n-r298-22', 'ST-16', 'R3 22.5°', 298.5, 22.5),
      curve('n-r298-45', 'ST-17', 'R3 45° Double', 298.5, 45),

      // --- 4th Radius Curves (R333.4mm) ---
      curve('n-r333-22', 'ST-18', 'R4 22.5°', 333.4, 22.5),
      curve('n-r333-45', 'ST-19', 'R4 45° Double', 333.4, 45),

      // --- Turnouts (1st Radius) ---
      turnout('n-turn-r', 'ST-5', 'Right Turnout', 87, 228, 22.5, 'right'),
      turnout('n-turn-l', 'ST-6', 'Left Turnout', 87, 228, 22.5, 'left'),

      // --- Curved Turnouts ---
      turnout('n-cturn-r', 'ST-44', 'Curved Right', 87, 228, 11.25, 'right'),
      turnout('n-cturn-l', 'ST-45', 'Curved Left', 87, 228, 11.25, 'left'),

      // --- Crossings ---
      crossing('n-cross-r', 'ST-50', 'Right Crossing', 87, 22.5),
      crossing('n-cross-l', 'ST-51', 'Left Crossing', 87, -22.5),

      // --- Level Crossing ---
      straight('n-level-x', 'ST-20', 'Level Crossing', 87, { levelCrossing: true }),

      // --- Buffer ---
      bufferStop('n-buffer', 'ST-8', 'Buffer Stop'),
    ]
  };

  // =========================================================================
  // Public API
  // =========================================================================
  const scales = { T: T_GAUGE, N: PECO_N };

  return {
    scales,
    getScale(name) { return scales[name]; },
    getPieces(scaleName) { return scales[scaleName]?.pieces || []; },
    getPiece(scaleName, pieceId) {
      return this.getPieces(scaleName).find(p => p.id === pieceId);
    },
    // Group pieces by type for palette display
    groupByType(scaleName) {
      const pieces = this.getPieces(scaleName);
      const groups = {};
      for (const p of pieces) {
        const type = p.type;
        if (!groups[type]) groups[type] = [];
        groups[type].push(p);
      }
      return groups;
    }
  };
})();
