const apiKeyInput  = document.getElementById('apiKey');
const titleEl      = document.getElementById('title');
const solveBtn     = document.getElementById('solveBtn');
const statusDiv    = document.getElementById('status');
const claudeConfig = document.getElementById('claudeConfig');
const radios       = document.querySelectorAll('input[name="method"]');

function setStatus(msg, type = '') {
  statusDiv.textContent = msg;
  statusDiv.className = type;
}

function getMethod() {
  return document.querySelector('input[name="method"]:checked')?.value || 'local';
}

// Update title based on current tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const url = tab?.url || '';
  if (url.includes('mini-sudoku'))  titleEl.textContent = 'Mini Sudoku Solver';
  else if (url.includes('queens'))  titleEl.textContent = 'Queens Solver';
  else if (url.includes('tango'))   titleEl.textContent = 'Tango Solver';
  else if (url.includes('/zip'))    titleEl.textContent = 'Zip Solver';
  else if (url.includes('patches')) titleEl.textContent = 'Patches Solver';
});

// Restore saved preferences
chrome.storage.local.get(['anthropicApiKey', 'solverMethod'], ({ anthropicApiKey, solverMethod }) => {
  const method = solverMethod || 'local';
  document.querySelector(`input[value="${method}"]`).checked = true;
  claudeConfig.style.display = method === 'claude' ? 'block' : 'none';
  if (anthropicApiKey) apiKeyInput.value = anthropicApiKey;
});

radios.forEach(radio => {
  radio.addEventListener('change', () => {
    const method = getMethod();
    claudeConfig.style.display = method === 'claude' ? 'block' : 'none';
    chrome.storage.local.set({ solverMethod: method });
    setStatus('');
  });
});

solveBtn.addEventListener('click', async () => {
  const method = getMethod();

  if (method === 'claude') {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { setStatus('Veuillez entrer votre clé API Anthropic.', 'error'); return; }
    chrome.storage.local.set({ anthropicApiKey: apiKey });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || '';

  const knownGames = ['games/queens', 'games/mini-sudoku', 'games/tango', 'games/zip', 'games/patches'];
  if (!knownGames.some(g => url.includes(g))) {
    setStatus('Ouvrez Queens, Mini Sudoku ou Tango sur LinkedIn.', 'error');
    return;
  }

  solveBtn.disabled = true;
  setStatus('Lecture de la grille...', 'loading');

  // Re-inject content script to handle SPA navigation (no page reload between games)
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) { /* already injected or CSP issue — proceed anyway */ }

  chrome.tabs.sendMessage(tab.id, { action: 'readGrid' }, async (response) => {
    if (chrome.runtime.lastError || !response) {
      setStatus('Impossible de lire la grille. Rechargez la page.', 'error');
      solveBtn.disabled = false;
      return;
    }
    if (response.error) {
      setStatus(response.error, 'error');
      solveBtn.disabled = false;
      return;
    }

    const game = response.game; // 'queens' or 'sudoku'

    if (method === 'local') {
      setStatus('Résolution en cours...', 'loading');

      const localMsg = game === 'sudoku'
        ? { action: 'solveAndApplyLocal', game: 'sudoku', board: response.board, rows: response.rows, cols: response.cols }
        : game === 'tango'
        ? { action: 'solveAndApplyLocal', game: 'tango', cells: response.cells, size: response.size, constraints: response.constraints }
        : game === 'zip'
        ? { action: 'solveAndApplyLocal', game: 'zip', size: response.size, waypoints: response.waypoints }
        : game === 'patches'
        ? { action: 'solveAndApplyLocal', game: 'patches', size: response.size, anchors: response.anchors }
        : { action: 'solveAndApplyLocal', game: 'queens', grid: response.grid, size: response.size };

      chrome.tabs.sendMessage(tab.id, localMsg, (res) => {
        solveBtn.disabled = false;
        if (res?.success) setStatus('Grille résolue !', 'success');
        else setStatus(res?.error || 'Aucune solution trouvée.', 'error');
      });

    } else {
      setStatus('Appel à Claude AI...', 'loading');
      const apiKey = apiKeyInput.value.trim();

      chrome.runtime.sendMessage(
        { action: 'solveWithClaude', game, ...response, apiKey },
        (solveRes) => {
          if (chrome.runtime.lastError || !solveRes) {
            setStatus('Erreur lors de l\'appel à Claude.', 'error');
            solveBtn.disabled = false;
            return;
          }
          if (solveRes.error) {
            setStatus(solveRes.error, 'error');
            solveBtn.disabled = false;
            return;
          }

          setStatus('Application de la solution...', 'loading');

          const applyMsg = game === 'sudoku'
            ? { action: 'applySolution', game: 'sudoku', board: response.board, solvedGrid: solveRes.solvedGrid, rows: response.rows, cols: response.cols }
            : game === 'tango'
            ? { action: 'applySolution', game: 'tango', cells: response.cells, solvedGrid: solveRes.solvedGrid, size: response.size }
            : game === 'zip'
            ? { action: 'applySolution', game: 'zip', path: solveRes.path, size: response.size }
            : { action: 'applySolution', game: 'queens', solution: solveRes.solution };

          chrome.tabs.sendMessage(tab.id, applyMsg, (applyRes) => {
            solveBtn.disabled = false;
            if (applyRes?.success) setStatus('Grille résolue !', 'success');
            else setStatus('Erreur lors de l\'application.', 'error');
          });
        }
      );
    }
  });
});
