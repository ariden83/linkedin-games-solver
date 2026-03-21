const LOG  = (...args) => console.log('[Games Solver]', ...args);
const WARN = (...args) => console.warn('[Games Solver]', ...args);

// ─── Shared helpers ──────────────────────────────────────────────────────────

function waitForStateChange(el, timeout = 500) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { observer.disconnect(); resolve(); }, timeout);
    const observer = new MutationObserver(() => {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Game detection ──────────────────────────────────────────────────────────

function detectGame() {
  const path = window.location.pathname;
  if (path.includes('/games/tango'))       return 'tango';
  if (path.includes('/games/mini-sudoku')) return 'sudoku';
  if (path.includes('/games/zip'))         return 'zip';
  if (path.includes('/games/patches'))     return 'patches';
  if (path.includes('/games/queens'))      return 'queens';
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// QUEENS
// ════════════════════════════════════════════════════════════════════════════

function getCellState(cell) {
  if (cell.querySelector('[data-test-flippable-queen="true"]')) return 'queen';
  if (cell.querySelector('[data-testid="cross-svg"]'))          return 'cross';
  return 'empty';
}

function cellCoords(cell) {
  const label = cell.getAttribute('aria-label') || '';
  const m = label.match(/(?:ligne|row) (\d+),\s*(?:colonne|column) (\d+)/);
  return m ? `ligne ${m[1]}, col ${m[2]}` : cell.getAttribute('data-cell-idx');
}

async function clickUntilState(cell, targetState, maxClicks = 3) {
  for (let i = 0; i < maxClicks; i++) {
    const state = getCellState(cell);
    if (state === targetState) return true;
    LOG(`  clic ${i + 1} sur (${cellCoords(cell)}) : "${state}" → "${targetState}"`);
    cell.click();
    await waitForStateChange(cell);
  }
  const final = getCellState(cell);
  if (final !== targetState) WARN(`  échec : état final "${final}" ≠ cible "${targetState}"`);
  return final === targetState;
}

function parseAriaLabel(label) {
  const colorMatch = label.match(/(?:couleur|color) ([^,]+)/);
  const posMatch   = label.match(/(?:ligne|row) (\d+),\s*(?:colonne|column) (\d+)/);
  return { colorMatch, posMatch };
}

function readQueensGrid() {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return null;
  const style     = container.getAttribute('style') || '';
  const sizeMatch = style.match(/--_[a-f0-9]+:\s*(\d+)/);
  const size      = sizeMatch ? parseInt(sizeMatch[1]) : 8;
  LOG(`Queens — grille ${size}x${size}`);

  const grid = [], colorsSeen = new Set();
  for (const cell of container.querySelectorAll('[data-cell-idx]')) {
    const label = cell.getAttribute('aria-label') || '';
    const { colorMatch, posMatch } = parseAriaLabel(label);
    if (!colorMatch || !posMatch) continue;
    const color = colorMatch[1].trim();
    colorsSeen.add(color);
    grid.push({ index: parseInt(cell.getAttribute('data-cell-idx')),
                row: parseInt(posMatch[1]) - 1, col: parseInt(posMatch[2]) - 1, color });
  }
  LOG(`${grid.length} cases, ${colorsSeen.size} couleurs`);
  return { game: 'queens', grid, size };
}

async function applyQueensSolution(solution) {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return { success: false, error: 'Grille Queens introuvable.' };

  const cellMap = {};
  for (const cell of container.querySelectorAll('[data-cell-idx]')) {
    const label = cell.getAttribute('aria-label') || '';
    const { posMatch } = parseAriaLabel(label);
    if (posMatch) cellMap[`${parseInt(posMatch[1]) - 1},${parseInt(posMatch[2]) - 1}`] = cell;
  }

  const solutionSet = new Set(solution.map(([r, c]) => `${r},${c}`));
  let resetCount = 0;
  for (const [key, cell] of Object.entries(cellMap)) {
    if (!solutionSet.has(key) && getCellState(cell) !== 'empty') {
      await clickUntilState(cell, 'empty'); resetCount++;
    }
  }
  if (resetCount) LOG(`${resetCount} case(s) remise(s) à vide.`);

  for (const [row, col] of solution) {
    const cell = cellMap[`${row},${col}`];
    if (!cell) { WARN(`Case introuvable (${row},${col})`); continue; }
    const ok = await clickUntilState(cell, 'queen');
    LOG(`  reine (${row + 1},${col + 1}) : ${ok ? 'OK' : 'ECHEC'}`);
  }
  return { success: true };
}

function solveQueens(grid, size) {
  LOG('Solveur Queens...');
  const t0 = performance.now();
  const colorIndex = {}, colorMap = Array.from({ length: size }, () => Array(size).fill(-1));
  let colorCount = 0;
  for (const cell of grid) {
    if (!(cell.color in colorIndex)) colorIndex[cell.color] = colorCount++;
    colorMap[cell.row][cell.col] = colorIndex[cell.color];
  }
  const solution = [], usedCols = new Set(), usedColors = new Set();
  function conflicts(row, col) {
    for (const [r, c] of solution) if (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1) return true;
    return false;
  }
  function backtrack(row) {
    if (row === size) return true;
    for (let col = 0; col < size; col++) {
      if (usedCols.has(col)) continue;
      const color = colorMap[row][col];
      if (color === -1 || usedColors.has(color) || conflicts(row, col)) continue;
      solution.push([row, col]); usedCols.add(col); usedColors.add(color);
      if (backtrack(row + 1)) return true;
      solution.pop(); usedCols.delete(col); usedColors.delete(color);
    }
    return false;
  }
  const solved = backtrack(0);
  LOG(`${solved ? 'Solution' : 'Aucune solution'} en ${(performance.now() - t0).toFixed(2)}ms`);
  if (solved) {
    LOG('  reines :', solution.map(([r, c]) => `(${r + 1},${c + 1})`).join(' '));
    const gridDisplay = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) =>
        solution.some(([sr, sc]) => sr === r && sc === c) ? '♛' : '·'
      ).join(' ')
    ).join('\n');
    LOG('Grille :\n' + gridDisplay);
  }
  return solved ? solution : null;
}

// ════════════════════════════════════════════════════════════════════════════
// SUDOKU
// ════════════════════════════════════════════════════════════════════════════

function readSudokuGrid() {
  const gridEl = document.querySelector('.sudoku-grid');
  if (!gridEl) return null;
  const cols = parseInt(gridEl.style.getPropertyValue('--cols')) || 6;
  const rows = parseInt(gridEl.style.getPropertyValue('--rows')) || 6;
  LOG(`Sudoku — grille ${rows}x${cols}`);

  const board = Array.from({ length: rows }, () => Array(cols).fill(null).map(() => ({ value: 0, given: false })));
  for (const cell of gridEl.querySelectorAll('[data-cell-idx]')) {
    const idx   = parseInt(cell.getAttribute('data-cell-idx'));
    const row   = Math.floor(idx / cols), col = idx % cols;
    const text  = cell.querySelector('.sudoku-cell-content')?.textContent?.trim();
    board[row][col] = { value: text ? parseInt(text) : 0, given: cell.classList.contains('sudoku-cell-prefilled') };
  }
  const empty = board.flat().filter(c => !c.given && c.value === 0).length;
  LOG(`${board.flat().filter(c => c.given).length} données, ${empty} à remplir`);
  return { game: 'sudoku', board, rows, cols };
}

function solveSudoku(board, rows, cols) {
  LOG('Solveur Sudoku...');
  const t0 = performance.now();
  const blockRows = rows === 6 ? 2 : Math.sqrt(rows);
  const blockCols = cols / blockRows;
  const grid = board.map(row => row.map(c => c.value));

  function isValid(grid, r, c, num) {
    if (grid[r].includes(num)) return false;
    if (grid.some(row => row[c] === num)) return false;
    const br = Math.floor(r / blockRows) * blockRows, bc = Math.floor(c / blockCols) * blockCols;
    for (let dr = 0; dr < blockRows; dr++)
      for (let dc = 0; dc < blockCols; dc++)
        if (grid[br + dr][bc + dc] === num) return false;
    return true;
  }
  function backtrack() {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== 0) continue;
        for (let num = 1; num <= cols; num++) {
          if (!isValid(grid, r, c, num)) continue;
          grid[r][c] = num;
          if (backtrack()) return true;
          grid[r][c] = 0;
        }
        return false;
      }
    return true;
  }
  const solved = backtrack();
  LOG(`${solved ? 'Solution' : 'Aucune solution'} en ${(performance.now() - t0).toFixed(2)}ms`);
  if (solved) {
    const gridDisplay = grid.map(row => row.join(' ')).join('\n');
    LOG('Grille :\n' + gridDisplay);
  }
  return solved ? grid : null;
}

async function applySudokuSolution(board, solvedGrid, rows, cols) {
  const gridEl = document.querySelector('.sudoku-grid');
  if (!gridEl) return { success: false, error: 'Grille Sudoku introuvable.' };
  LOG('Application Sudoku...');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].given || board[r][c].value !== 0) continue;
      const cell = gridEl.querySelector(`[data-cell-idx="${r * cols + c}"]`);
      if (!cell) { WARN(`Case introuvable (${r},${c})`); continue; }
      cell.click(); await sleep(80);
      const btn = document.querySelector(`.sudoku-input-button[data-number="${solvedGrid[r][c]}"]`);
      if (!btn) { WARN(`Bouton ${solvedGrid[r][c]} introuvable`); continue; }
      btn.click(); await sleep(80);
      LOG(`  (${r + 1},${c + 1}) = ${solvedGrid[r][c]}`);
    }
  }
  return { success: true };
}

// ════════════════════════════════════════════════════════════════════════════
// TANGO
// ════════════════════════════════════════════════════════════════════════════

// CSS classes that encode constraint direction
const TANGO_CLASS_HORIZONTAL = '_4c3a3cab'; // constraint → right neighbor (idx+1)
const TANGO_CLASS_VERTICAL   = '_6f718039'; // constraint → bottom neighbor (idx+size)

function readTangoGrid() {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return null;
  const style     = container.getAttribute('style') || '';
  const sizeMatch = style.match(/--_[a-f0-9]+:\s*(\d+)/);
  const size      = sizeMatch ? parseInt(sizeMatch[1]) : 6;
  LOG(`Tango — grille ${size}x${size}`);

  const cells      = new Array(size * size).fill(-1); // -1=empty, 0=sun, 1=moon
  const constraints = [];

  for (const cell of container.querySelectorAll('[data-cell-idx]')) {
    const idx = parseInt(cell.getAttribute('data-cell-idx'));
    if (cell.querySelector('[data-testid="cell-zero"]')) cells[idx] = 0; // sun
    if (cell.querySelector('[data-testid="cell-one"]'))  cells[idx] = 1; // moon

    // Detect constraint and direction
    const equalEl = cell.querySelector('[data-testid="edge-equal"]');
    const crossEl = cell.querySelector('[data-testid="edge-cross"]');
    const cEl     = equalEl || crossEl;
    if (cEl) {
      const wClass    = cEl.closest('div')?.className || '';
      const isHoriz   = wClass.includes(TANGO_CLASS_HORIZONTAL);
      const neighbor  = isHoriz ? idx + 1 : idx + size;
      constraints.push({ idx1: idx, idx2: neighbor, type: equalEl ? 'equal' : 'cross' });
      LOG(`  contrainte ${equalEl ? '=' : 'X'} entre cell ${idx} et ${neighbor} (${isHoriz ? 'H' : 'V'})`);
    }
  }

  const empty = cells.filter(v => v === -1).length;
  LOG(`${cells.filter(v => v === 0).length} soleils, ${cells.filter(v => v === 1).length} lunes, ${empty} vides`);
  LOG(`${constraints.length} contrainte(s)`);
  return { game: 'tango', cells, size, constraints };
}

function solveTango(cells, size, constraints) {
  LOG('Solveur Tango...');
  const t0   = performance.now();
  const grid = [...cells];
  const half = size / 2;

  // Build constraint lookup: cell idx → list of {other, type}
  const cMap = {};
  for (const { idx1, idx2, type } of constraints) {
    (cMap[idx1] = cMap[idx1] || []).push({ other: idx2, type });
    (cMap[idx2] = cMap[idx2] || []).push({ other: idx1, type });
  }

  function isValid(pos, val) {
    const r = Math.floor(pos / size), c = pos % size;

    // Honor constraints
    for (const { other, type } of (cMap[pos] || [])) {
      if (grid[other] === -1) continue;
      if (type === 'equal' && grid[other] !== val) return false;
      if (type === 'cross' && grid[other] === val) return false;
    }

    // Max half of each value per row
    let rowCount = 0;
    for (let i = 0; i < size; i++) if (grid[r * size + i] === val) rowCount++;
    if (rowCount >= half) return false;

    // Max half per column
    let colCount = 0;
    for (let i = 0; i < size; i++) if (grid[i * size + c] === val) colCount++;
    if (colCount >= half) return false;

    // No 3 consecutive in row
    const rStart = r * size;
    const rowVals = grid.slice(rStart, rStart + size);
    rowVals[c] = val;
    for (let i = 0; i <= size - 3; i++)
      if (rowVals[i] !== -1 && rowVals[i] === rowVals[i + 1] && rowVals[i + 1] === rowVals[i + 2]) return false;

    // No 3 consecutive in column
    const colVals = Array.from({ length: size }, (_, i) => i === r ? val : grid[i * size + c]);
    for (let i = 0; i <= size - 3; i++)
      if (colVals[i] !== -1 && colVals[i] === colVals[i + 1] && colVals[i + 1] === colVals[i + 2]) return false;

    return true;
  }

  function backtrack(pos) {
    if (pos === size * size) return true;
    if (grid[pos] !== -1) return backtrack(pos + 1);
    for (const val of [0, 1]) {
      if (!isValid(pos, val)) continue;
      grid[pos] = val;
      if (backtrack(pos + 1)) return true;
      grid[pos] = -1;
    }
    return false;
  }

  const solved = backtrack(0);
  LOG(`${solved ? 'Solution' : 'Aucune solution'} en ${(performance.now() - t0).toFixed(2)}ms`);
  if (solved) {
    const symbols = ['☀', '🌙'];
    const gridDisplay = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => symbols[grid[r * size + c]] ?? '·').join(' ')
    ).join('\n');
    LOG('Grille :\n' + gridDisplay);
  }
  return solved ? grid : null;
}

function getTangoState(cell) {
  if (cell.querySelector('[data-testid="cell-zero"]')) return 0;
  if (cell.querySelector('[data-testid="cell-one"]'))  return 1;
  return -1;
}

async function clickUntilTangoValue(cell, targetVal) {
  for (let i = 0; i < 4; i++) {
    if (getTangoState(cell) === targetVal) return true;
    cell.click();
    await waitForStateChange(cell);
  }
  return getTangoState(cell) === targetVal;
}

async function applyTangoSolution(originalCells, solvedGrid, size) {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return { success: false, error: 'Grille Tango introuvable.' };
  LOG('Application Tango...');

  const symbols = ['soleil', 'lune'];
  for (let idx = 0; idx < size * size; idx++) {
    if (originalCells[idx] !== -1) continue; // skip given cells
    const cell = container.querySelector(`[data-cell-idx="${idx}"]`);
    if (!cell) { WARN(`Case introuvable idx=${idx}`); continue; }
    const target = solvedGrid[idx];
    const ok = await clickUntilTangoValue(cell, target);
    const r = Math.floor(idx / size), c = idx % size;
    LOG(`  (${r + 1},${c + 1}) = ${symbols[target]} : ${ok ? 'OK' : 'ECHEC'}`);
  }
  return { success: true };
}

// ════════════════════════════════════════════════════════════════════════════
// ZIP
// ════════════════════════════════════════════════════════════════════════════

function readZipGrid() {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return null;

  const style     = container.getAttribute('style') || '';
  const sizeMatch = style.match(/--_[a-f0-9]+:\s*(\d+)/);
  const size      = sizeMatch ? parseInt(sizeMatch[1]) : 7;

  const waypointMap = {}; // number → cellIdx
  for (const cell of container.querySelectorAll('[data-cell-idx]')) {
    const idx   = parseInt(cell.getAttribute('data-cell-idx'));
    const numEl = cell.querySelector('[data-cell-content="true"]');
    if (numEl) {
      const num = parseInt(numEl.textContent.trim());
      if (!isNaN(num)) waypointMap[num] = idx;
    }
  }

  const maxNum  = Math.max(...Object.keys(waypointMap).map(Number));
  const waypoints = Array.from({ length: maxNum }, (_, i) => waypointMap[i + 1]);

  LOG(`Zip — grille ${size}x${size}, ${maxNum} waypoints`);
  waypoints.forEach((idx, i) => {
    const r = Math.floor(idx / size), c = idx % size;
    LOG(`  ${i + 1}: cell ${idx} (ligne ${r + 1}, col ${c + 1})`);
  });

  return { game: 'zip', size, waypoints };
}

function solveZip(size, waypoints) {
  LOG('Solveur Zip (chemin Hamiltonien ordonné)...');
  const t0    = performance.now();
  const total = size * size;

  const waypointSet   = new Set(waypoints);
  const waypointIndex = {}; // cellIdx → position in waypoints array
  waypoints.forEach((idx, i) => waypointIndex[idx] = i);

  const path    = [waypoints[0]];
  const visited = new Set([waypoints[0]]);
  let   nextWP  = 1; // index of next required waypoint

  function getNeighbors(idx) {
    const r = Math.floor(idx / size), c = idx % size, nbrs = [];
    if (r > 0)        nbrs.push(idx - size);
    if (r < size - 1) nbrs.push(idx + size);
    if (c > 0)        nbrs.push(idx - 1);
    if (c < size - 1) nbrs.push(idx + 1);
    return nbrs;
  }

  // BFS reachability check: can we reach `target` from `from` through unvisited cells?
  function canReach(from, target) {
    if (from === target) return true;
    const queue = [from], seen = new Set([from]);
    while (queue.length) {
      const cur = queue.shift();
      for (const nbr of getNeighbors(cur)) {
        if (seen.has(nbr) || visited.has(nbr)) continue;
        if (nbr === target) return true;
        seen.add(nbr);
        queue.push(nbr);
      }
    }
    return false;
  }

  function backtrack() {
    if (visited.size === total) return nextWP >= waypoints.length;

    const current = path[path.length - 1];

    for (const nbr of getNeighbors(current)) {
      if (visited.has(nbr)) continue;

      // Waypoint cells must be visited in order
      if (waypointSet.has(nbr) && waypoints[nextWP] !== nbr) continue;

      // Pruning: next required waypoint must still be reachable
      const advancesWP = waypointSet.has(nbr);
      const newNextWP  = advancesWP ? nextWP + 1 : nextWP;
      if (newNextWP < waypoints.length) {
        visited.add(nbr);
        const reachable = canReach(nbr, waypoints[newNextWP]);
        visited.delete(nbr);
        if (!reachable) continue;
      }

      path.push(nbr);
      visited.add(nbr);
      const prev = nextWP;
      if (advancesWP) nextWP++;

      if (backtrack()) return true;

      path.pop();
      visited.delete(nbr);
      nextWP = prev;
    }
    return false;
  }

  const solved = backtrack();
  const ms = (performance.now() - t0).toFixed(2);
  LOG(`${solved ? 'Solution' : 'Aucune solution'} en ${ms}ms`);

  if (solved) {
    // Build connectivity map (which directions each cell connects in the path)
    const conn = {};
    const gc = i => { if (!conn[i]) conn[i] = {}; return conn[i]; };
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const dc = (b % size) - (a % size);
      const dr = Math.floor(b / size) - Math.floor(a / size);
      if (dc ===  1) { gc(a).R = true; gc(b).L = true; }
      if (dc === -1) { gc(a).L = true; gc(b).R = true; }
      if (dr ===  1) { gc(a).D = true; gc(b).U = true; }
      if (dr === -1) { gc(a).U = true; gc(b).D = true; }
    }
    const stepAt = {};
    path.forEach((idx, i) => { stepAt[idx] = i + 1; });

    // Render: each cell = 3 chars, horizontal connector = 1 char, vertical connector line between rows
    const lines = [];
    for (let r = 0; r < size; r++) {
      let row = '';
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const cn = gc(idx);
        const label = waypointSet.has(idx)
          ? ('W' + (waypointIndex[idx] + 1)).padStart(3)
          : String(stepAt[idx]).padStart(3);
        if (c > 0) row += cn.L ? '-' : ' ';
        row += label;
      }
      lines.push(row);
      if (r < size - 1) {
        let vrow = '';
        for (let c = 0; c < size; c++) {
          if (c > 0) vrow += ' ';
          vrow += ' ' + (gc(r * size + c).D ? '|' : ' ') + ' ';
        }
        lines.push(vrow);
      }
    }
    LOG('Chemin :\n' + lines.join('\n'));
  }

  return solved ? path : null;
}

async function applyZipSolution(pathCells, size) {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return { success: false, error: 'Grille Zip introuvable.' };
  LOG(`Application du chemin Zip (${pathCells.length} cases)...`);

  const getCell   = idx => container.querySelector(`[data-cell-idx="${idx}"]`);
  const getCenter = cell => {
    const r = cell.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const countFilled = () => container.querySelectorAll('[data-testid="filled-cell"]').length;

  const firstCell = getCell(pathCells[0]);
  if (!firstCell) return { success: false, error: 'Première case introuvable.' };

  // ── Mode 1 : drag lent interpolé, événements sur l'élément sous le curseur ─
  const tryDrag = async () => {
    const mkPtr = (type, x, y) => new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, buttons: 1, clientX: x, clientY: y,
    });
    const mkMouse = (type, x, y) => new MouseEvent(type, {
      bubbles: true, cancelable: true, buttons: 1, clientX: x, clientY: y,
    });
    const lerp   = (a, b, t) => a + (b - a) * t;
    const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-cell-idx]');

    const { x: sx, y: sy } = getCenter(firstCell);
    firstCell.dispatchEvent(mkPtr('pointerdown', sx, sy));
    firstCell.dispatchEvent(mkMouse('mousedown', sx, sy));
    await sleep(160);

    let curX = sx, curY = sy;
    let underCell = firstCell;

    for (let i = 1; i < pathCells.length; i++) {
      const cell = getCell(pathCells[i]);
      if (!cell) { WARN(`Case ${pathCells[i]} introuvable`); continue; }
      const { x: tx, y: ty } = getCenter(cell);

      const dist  = Math.hypot(tx - curX, ty - curY);
      const steps = Math.max(5, Math.round(dist / 8));

      for (let s = 1; s <= steps; s++) {
        const x = lerp(curX, tx, s / steps);
        const y = lerp(curY, ty, s / steps);

        const el = cellAt(x, y) || underCell;

        if (el !== underCell) {
          underCell.dispatchEvent(mkMouse('mouseout',   x, y));
          underCell.dispatchEvent(mkMouse('mouseleave', x, y));
          underCell.dispatchEvent(mkPtr ('pointerout',  x, y));
          el.dispatchEvent(mkMouse('mouseover',   x, y));
          el.dispatchEvent(mkMouse('mouseenter',  x, y));
          el.dispatchEvent(mkPtr ('pointerover',  x, y));
          el.dispatchEvent(mkPtr ('pointerenter', x, y));
          underCell = el;
        }

        el.dispatchEvent(mkPtr ('pointermove', x, y));
        document.dispatchEvent(mkPtr ('pointermove', x, y));
        el.dispatchEvent(mkMouse('mousemove',   x, y));
        document.dispatchEvent(mkMouse('mousemove',   x, y));
        await sleep(14);
      }

      curX = tx; curY = ty;
    }

    underCell.dispatchEvent(mkPtr ('pointerup', curX, curY));
    document.dispatchEvent(mkPtr ('pointerup', curX, curY));
    underCell.dispatchEvent(mkMouse('mouseup',  curX, curY));
    document.dispatchEvent(mkMouse('mouseup',   curX, curY));
    await sleep(200);
  };

  // ── Mode 2 : individual clicks ────────────────────────────────────────────
  const tryClicks = async () => {
    for (const idx of pathCells) {
      const cell = getCell(idx);
      if (!cell) { WARN(`Case ${idx} introuvable`); continue; }
      cell.click();
      await sleep(30);
    }
    await sleep(200);
  };

  // Try drag first, fall back to clicks if nothing got filled
  LOG('Tentative mode drag...');
  await tryDrag();

  if (countFilled() === 0) {
    LOG('Drag sans effet — tentative mode clics...');
    await tryClicks();
  }

  const filled = countFilled();
  LOG(`Application Zip terminée (${filled}/${pathCells.length} cases remplies).`);
  return { success: true };
}

// ════════════════════════════════════════════════════════════════════════════
// PATCHES
// ════════════════════════════════════════════════════════════════════════════

const PATCHES_COLOR_NAMES = {
  '#00AFFF': 'bleu',
  '#0097A7': 'cyan',
  '#7C4DFF': 'mauve',
  '#C49000': 'or',
  '#E91E63': 'rose',
  '#4CAF50': 'vert',
  '#FF5722': 'rouge',
  '#FF9800': 'orange',
  '#9C27B0': 'violet',
  '#795548': 'brun',
};

function patchesColorName(color, fallbackIndex) {
  return PATCHES_COLOR_NAMES[color.toUpperCase()]
    || PATCHES_COLOR_NAMES[color]
    || `R${fallbackIndex + 1}`;
}

function readPatchesGrid() {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return null;

  const style     = container.getAttribute('style') || '';
  const sizeMatch = style.match(/--_[a-f0-9]+:\s*(\d+)/);
  const size      = sizeMatch ? parseInt(sizeMatch[1]) : 5;

  const anchors = [];
  for (const cell of container.querySelectorAll('[data-cell-idx]')) {
    const cellStyle  = cell.getAttribute('style') || '';
    const colorMatch = cellStyle.match(/--d0eb54f0:\s*(#[0-9a-fA-F]+)/);
    if (!colorMatch) continue;

    const idx      = parseInt(cell.getAttribute('data-cell-idx'));
    const color    = colorMatch[1];
    const shapeEl  = cell.querySelector('[data-shape]');
    const shape    = shapeEl ? shapeEl.getAttribute('data-shape') : 'PatchesShapeConstraint_UNKNOWN';
    const clueEl   = cell.querySelector('[data-testid^="patches-clue-number-"]');
    const clueSize = clueEl ? parseInt(clueEl.textContent.trim()) : null;

    anchors.push({ idx, color, size: clueSize, shape });
  }

  LOG(`Patches — grille ${size}x${size}, ${anchors.length} régions`);
  anchors.forEach(a => {
    const r = Math.floor(a.idx / size), c = a.idx % size;
    LOG(`  ${a.color} taille=${a.size} ${a.shape.replace('PatchesShapeConstraint_', '')} : cell ${a.idx} (ligne ${r + 1}, col ${c + 1})`);
  });

  return { game: 'patches', size, anchors };
}

function solvePatchesGrid(size, anchors) {
  LOG('Solveur Patches (backtracking rectangles)...');
  const t0    = performance.now();
  const total = size * size;

  // For each anchor, enumerate all valid rectangle placements
  const validRects = anchors.map(anchor => {
    const ar    = Math.floor(anchor.idx / size);
    const ac    = anchor.idx % size;
    const n     = anchor.size;
    const shape = anchor.shape;
    const rects = [];

    for (let h = 1; h <= n; h++) {
      if (n % h !== 0) continue;
      const w = n / h;
      if (shape === 'PatchesShapeConstraint_HORIZONTAL_RECT' && w <= h) continue;
      if (shape === 'PatchesShapeConstraint_VERTICAL_RECT'   && h <= w) continue;

      // Enumerate all valid top-left corners where anchor falls inside the rect
      for (let tr = Math.max(0, ar - h + 1); tr <= ar && tr + h <= size; tr++) {
        for (let tc = Math.max(0, ac - w + 1); tc <= ac && tc + w <= size; tc++) {
          rects.push({ tr, tc, h, w });
        }
      }
    }
    return rects;
  });

  const rectCells = ({ tr, tc, h, w }) => {
    const cells = [];
    for (let r = tr; r < tr + h; r++)
      for (let c = tc; c < tc + w; c++)
        cells.push(r * size + c);
    return cells;
  };

  // Sort by most constrained first
  const order      = anchors.map((_, i) => i).sort((a, b) => validRects[a].length - validRects[b].length);
  const assignment = new Array(anchors.length).fill(null);
  const usedCells  = new Set();

  const backtrack = step => {
    if (step === anchors.length) return usedCells.size === total;
    const ai = order[step];
    for (const rect of validRects[ai]) {
      const cells = rectCells(rect);
      if (cells.some(c => usedCells.has(c))) continue;
      cells.forEach(c => usedCells.add(c));
      assignment[ai] = rect;
      if (backtrack(step + 1)) return true;
      cells.forEach(c => usedCells.delete(c));
      assignment[ai] = null;
    }
    return false;
  };

  const solved = backtrack(0);
  LOG(`Solution en ${(performance.now() - t0).toFixed(2)}ms`);
  if (!solved) return null;

  const solution = anchors.map((anchor, i) => ({
    color: anchor.color,
    anchorIdx: anchor.idx,
    ...assignment[i],
    cells: rectCells(assignment[i]),
  }));

  // Log visual
  const nameOf  = solution.map(({ color }, i) => patchesColorName(color, i));
  const colW    = Math.max(...nameOf.map(n => n.length));
  const pad     = s => s.padEnd(colW);
  const grid    = Array.from({ length: size }, () => Array(size).fill(pad('·')));
  solution.forEach(({ cells }, i) => {
    cells.forEach(idx => { grid[Math.floor(idx / size)][idx % size] = pad(nameOf[i]); });
  });
  LOG('Régions :\n' + grid.map(row => row.join(' ')).join('\n'));

  return solution;
}

async function applyPatchesSolution(regions, size) {
  const container = document.querySelector('[data-testid="interactive-grid"]');
  if (!container) return { success: false, error: 'Grille Patches introuvable.' };
  LOG(`Application de ${regions.length} régions Patches...`);

  const getCell   = idx => container.querySelector(`[data-cell-idx="${idx}"]`);
  const getCenter = cell => {
    const r = cell.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const mkPtr   = (type, x, y) => new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, buttons: 1, clientX: x, clientY: y,
  });
  const mkMouse = (type, x, y) => new MouseEvent(type, {
    bubbles: true, cancelable: true, buttons: 1, clientX: x, clientY: y,
  });

  const countFilled = () => container.querySelectorAll('[data-testid^="patches-clue-number-"]').length;

  // ── Mode 1 : drag lent interpolé, événements sur l'élément sous le curseur ─
  const tryDrag = async () => {
    const lerp     = (a, b, t) => a + (b - a) * t;
    const cellAt   = (x, y) => document.elementFromPoint(x, y)?.closest('[data-cell-idx]');

    for (const region of regions) {
      const { tr, tc, h, w, cells, color, anchorIdx } = region;
      LOG(`  ${color} : (ligne ${tr + 1}, col ${tc + 1}) → ${h}×${w}`);

      const anchorCell = getCell(anchorIdx);
      if (!anchorCell) { WARN(`  Ancre introuvable pour ${color}`); continue; }

      const { x: sx, y: sy } = getCenter(anchorCell);

      // Appuyer sur la case-ancre (case colorée avec chiffre)
      anchorCell.dispatchEvent(mkPtr('pointerdown', sx, sy));
      anchorCell.dispatchEvent(mkMouse('mousedown', sx, sy));
      await sleep(160);

      // Glisser case par case avec interpolation (mouvement humain)
      let curX = sx, curY = sy;
      let underCell = anchorCell;

      for (const idx of cells) {
        const target = getCell(idx);
        if (!target) continue;
        const { x: tx, y: ty } = getCenter(target);

        const dist  = Math.hypot(tx - curX, ty - curY);
        const steps = Math.max(5, Math.round(dist / 8));

        for (let i = 1; i <= steps; i++) {
          const x = lerp(curX, tx, i / steps);
          const y = lerp(curY, ty, i / steps);

          // Élément réellement sous le curseur à cette position
          const el = cellAt(x, y) || underCell;

          // Transition de case : mouseout/leave → mouseenter/over
          if (el !== underCell) {
            underCell.dispatchEvent(mkMouse('mouseout',   x, y));
            underCell.dispatchEvent(mkMouse('mouseleave', x, y));
            underCell.dispatchEvent(mkPtr ('pointerout',  x, y));
            el.dispatchEvent(mkMouse('mouseover',   x, y));
            el.dispatchEvent(mkMouse('mouseenter',  x, y));
            el.dispatchEvent(mkPtr ('pointerover',  x, y));
            el.dispatchEvent(mkPtr ('pointerenter', x, y));
            underCell = el;
          }

          // Mouvement continu sur l'élément courant + document
          el.dispatchEvent(mkPtr ('pointermove', x, y));
          document.dispatchEvent(mkPtr ('pointermove', x, y));
          el.dispatchEvent(mkMouse('mousemove',   x, y));
          document.dispatchEvent(mkMouse('mousemove',   x, y));
          await sleep(14);
        }

        curX = tx; curY = ty;
      }

      // Relâcher à la position finale
      underCell.dispatchEvent(mkPtr ('pointerup', curX, curY));
      document.dispatchEvent(mkPtr ('pointerup', curX, curY));
      underCell.dispatchEvent(mkMouse('mouseup',  curX, curY));
      document.dispatchEvent(mkMouse('mouseup',   curX, curY));
      await sleep(600);
    }
  };

  // ── Mode 2 : clics individuels (fallback) ─────────────────────────────────
  const tryClicks = async () => {
    for (const region of regions) {
      const { cells } = region;
      for (const idx of cells) {
        const cell = getCell(idx);
        if (!cell) continue;
        cell.click();
        await sleep(30);
      }
      await sleep(100);
    }
  };

  LOG('Tentative mode drag...');
  await tryDrag();

  if (countFilled() < regions.length) {
    LOG('Drag sans effet — tentative mode clics...');
    await tryClicks();
  }

  LOG('Application Patches terminée.');
  return { success: true };
}

// ════════════════════════════════════════════════════════════════════════════
// MESSAGE LISTENER
// ════════════════════════════════════════════════════════════════════════════

// Guard against duplicate listeners on SPA re-injection
if (!window.__gamesSolverInitialized) {
  window.__gamesSolverInitialized = true;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.action === 'readGrid') {
    const game = detectGame();
    if (!game) { sendResponse({ error: 'Aucun jeu détecté. Est-il chargé ?' }); return true; }
    const result = game === 'queens'  ? readQueensGrid()
                 : game === 'sudoku'  ? readSudokuGrid()
                 : game === 'tango'   ? readTangoGrid()
                 : game === 'patches' ? readPatchesGrid()
                 :                      readZipGrid();
    sendResponse(result || { error: 'Impossible de lire la grille.' });
    return true;
  }

  if (msg.action === 'solveAndApplyLocal') {
    if (msg.game === 'sudoku') {
      const solved = solveSudoku(msg.board, msg.rows, msg.cols);
      if (!solved) { sendResponse({ success: false, error: 'Aucune solution Sudoku.' }); return true; }
      applySudokuSolution(msg.board, solved, msg.rows, msg.cols).then(sendResponse);

    } else if (msg.game === 'tango') {
      const solved = solveTango(msg.cells, msg.size, msg.constraints);
      if (!solved) { sendResponse({ success: false, error: 'Aucune solution Tango.' }); return true; }
      applyTangoSolution(msg.cells, solved, msg.size).then(sendResponse);

    } else if (msg.game === 'zip') {
      const path = solveZip(msg.size, msg.waypoints);
      if (!path) { sendResponse({ success: false, error: 'Aucune solution Zip.' }); return true; }
      applyZipSolution(path, msg.size).then(sendResponse);

    } else if (msg.game === 'patches') {
      const solution = solvePatchesGrid(msg.size, msg.anchors);
      if (!solution) { sendResponse({ success: false, error: 'Aucune solution Patches.' }); return true; }
      applyPatchesSolution(solution, msg.size).then(sendResponse);

    } else {
      const solution = solveQueens(msg.grid, msg.size);
      if (!solution) { sendResponse({ success: false, error: 'Aucune solution Queens.' }); return true; }
      applyQueensSolution(solution).then(sendResponse);
    }
    return true;
  }

  if (msg.action === 'applySolution') {
    if (msg.game === 'sudoku') {
      applySudokuSolution(msg.board, msg.solvedGrid, msg.rows, msg.cols).then(sendResponse);
    } else if (msg.game === 'tango') {
      applyTangoSolution(msg.cells, msg.solvedGrid, msg.size).then(sendResponse);
    } else if (msg.game === 'zip') {
      applyZipSolution(msg.path, msg.size).then(sendResponse);
    } else if (msg.game === 'patches') {
      applyPatchesSolution(msg.solution, msg.size).then(sendResponse);
    } else {
      LOG('Solution Claude Queens :', msg.solution.map(([r, c]) => `(${r + 1},${c + 1})`).join(' '));
      applyQueensSolution(msg.solution).then(sendResponse);
    }
    return true;
  }
});

} // end __gamesSolverInitialized guard
