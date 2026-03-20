chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'solveWithClaude') {
    const fn = msg.game === 'sudoku' ? solveSudokuWithClaude
             : msg.game === 'tango'  ? solveTangoWithClaude
             : msg.game === 'zip'    ? solveZipWithClaude
             :                         solveQueensWithClaude;
    fn(msg)
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ error: err.message }));
    return true;
  }
});

// ─── Claude API helper ───────────────────────────────────────────────────────

async function callClaude(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur API: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error('Réponse vide de Claude.');
  return text;
}

// ─── Queens ──────────────────────────────────────────────────────────────────

async function solveQueensWithClaude({ grid, size, apiKey }) {
  const colorMap = Array.from({ length: size }, () => Array(size).fill(''));
  for (const cell of grid) colorMap[cell.row][cell.col] = cell.color;

  const gridText = colorMap.map((row, r) =>
    row.map((color, c) => `(${r},${c}):${color}`).join('  ')
  ).join('\n');

  const prompt = `Tu dois résoudre un puzzle "Queens" sur une grille ${size}x${size}.

Règles :
1. Exactement une reine par ligne
2. Exactement une reine par colonne
3. Exactement une reine par région de couleur
4. Aucune reine ne doit être adjacente à une autre (y compris en diagonale)

Grille (format ligne,colonne:couleur, indexation 0) :
${gridText}

Réponds UNIQUEMENT avec un tableau JSON des positions des reines, format :
[[ligne, colonne], [ligne, colonne], ...]

Aucun texte supplémentaire, juste le JSON.`;

  const text = await callClaude(apiKey, prompt);
  const jsonMatch = text.match(/\[\s*\[[\s\S]*\]\s*\]/);
  if (!jsonMatch) throw new Error(`Réponse inattendue : ${text.substring(0, 100)}`);

  const solution = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(solution) || solution.length !== size)
    throw new Error(`Solution invalide : ${solution.length} reines pour une grille ${size}x${size}`);

  return { solution };
}

// ─── Zip ─────────────────────────────────────────────────────────────────────

async function solveZipWithClaude({ size, waypoints, apiKey }) {
  const waypointText = waypoints.map((idx, i) => {
    const r = Math.floor(idx / size) + 1, c = idx % size + 1;
    return `${i + 1}: (ligne ${r}, col ${c})`;
  }).join('\n');

  const prompt = `Tu dois résoudre un puzzle Zip sur une grille ${size}x${size}.

Objectif : trouver un chemin Hamiltonien qui :
- Visite TOUTES les ${size * size} cases exactement une fois
- Passe par les waypoints numérotés dans l'ordre croissant (1, 2, 3, ...)
- Se déplace uniquement vers des cases adjacentes (haut/bas/gauche/droite)

Waypoints (cases obligatoires à visiter dans cet ordre) :
${waypointText}

Grille ${size}x${size}, cases numérotées de 0 à ${size * size - 1} (gauche→droite, haut→bas).
Formule : idx = (ligne-1)*${size} + (col-1)

Réponds UNIQUEMENT avec un tableau JSON des indices de cases dans l'ordre du chemin complet :
[idx0, idx1, idx2, ..., idx${size * size - 1}]

Le chemin doit commencer au waypoint 1 et se terminer au waypoint ${waypoints.length}.
Aucun texte supplémentaire, juste le JSON.`;

  const text = await callClaude(apiKey, prompt);
  const jsonMatch = text.match(/\[\s*\d[\s\S]*?\]/);
  if (!jsonMatch) throw new Error(`Réponse inattendue : ${text.substring(0, 100)}`);

  const path = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(path) || path.length !== size * size)
    throw new Error(`Chemin invalide : ${path.length} cases au lieu de ${size * size}`);

  return { path };
}

// ─── Tango ───────────────────────────────────────────────────────────────────

async function solveTangoWithClaude({ cells, size, constraints, apiKey }) {
  const symbols = { '-1': '.', 0: 'S', 1: 'L' };
  const gridText = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => symbols[cells[r * size + c]]).join(' ')
  ).join('\n');

  const constraintText = constraints.map(({ idx1, idx2, type }) => {
    const r1 = Math.floor(idx1 / size) + 1, c1 = idx1 % size + 1;
    const r2 = Math.floor(idx2 / size) + 1, c2 = idx2 % size + 1;
    return `(${r1},${c1}) ${type === 'equal' ? '=' : 'X'} (${r2},${c2})`;
  }).join(', ');

  const prompt = `Tu dois résoudre ce puzzle Tango ${size}x${size}.

Symboles : S = Soleil, L = Lune, . = vide à remplir

Règles :
1. Chaque cellule contient S ou L
2. Exactement ${size / 2} S et ${size / 2} L par ligne et par colonne
3. Pas plus de 2 symboles identiques consécutifs dans une ligne ou colonne
4. Contraintes entre cases adjacentes : "=" signifie même symbole, "X" signifie symboles différents

Grille actuelle :
${gridText}

Contraintes : ${constraintText || 'aucune'}

Réponds UNIQUEMENT avec la grille complète résolue en JSON (tableau 2D, 0=Soleil, 1=Lune) :
[[0,1,...],[...],...]

Aucun texte supplémentaire, juste le JSON.`;

  const text = await callClaude(apiKey, prompt);
  const jsonMatch = text.match(/\[\s*\[[\s\S]*\]\s*\]/);
  if (!jsonMatch) throw new Error(`Réponse inattendue : ${text.substring(0, 100)}`);

  const grid2D = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(grid2D) || grid2D.length !== size)
    throw new Error('Grille Tango résolue invalide');

  const solvedGrid = grid2D.flat();
  return { solvedGrid };
}

// ─── Sudoku ──────────────────────────────────────────────────────────────────

async function solveSudokuWithClaude({ board, rows, cols, apiKey }) {
  const gridText = board.map((row, r) =>
    row.map((cell, c) => cell.value === 0 ? '.' : cell.value).join(' ')
  ).join('\n');

  const prompt = `Tu dois résoudre ce Mini Sudoku ${rows}x${cols}.

Règles :
1. Chaque ligne contient les chiffres 1 à ${cols} une seule fois
2. Chaque colonne contient les chiffres 1 à ${cols} une seule fois
3. Chaque bloc de ${rows === 6 ? '2x3' : Math.sqrt(rows) + 'x' + Math.sqrt(cols)} contient les chiffres 1 à ${cols} une seule fois

Grille actuelle (. = case vide) :
${gridText}

Réponds UNIQUEMENT avec la grille résolue complète en JSON, format tableau 2D :
[[1,2,3,4,5,6],[...],...]

Aucun texte supplémentaire, juste le JSON.`;

  const text = await callClaude(apiKey, prompt);
  const jsonMatch = text.match(/\[\s*\[[\s\S]*\]\s*\]/);
  if (!jsonMatch) throw new Error(`Réponse inattendue : ${text.substring(0, 100)}`);

  const solvedGrid = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(solvedGrid) || solvedGrid.length !== rows)
    throw new Error(`Grille résolue invalide`);

  return { solvedGrid };
}
