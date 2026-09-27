'use strict';

(() => {
  const board = document.querySelector('#lab-board');
  const manualGrid = document.querySelector('#manual-grid');
  const labelForTreatment = (id) => id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');

  window.LabUI = {
    show() { board.hidden = false; },
    renderManual(entries) {
      manualGrid.replaceChildren();
      entries.forEach((entry) => {
        const card = document.createElement('article'); card.className = 'manual-card panel';
        const title = document.createElement('h2'); title.textContent = entry.name;
        const prompt = document.createElement('p'); prompt.className = 'diagnosis-prompt'; prompt.textContent = entry.diagnosisPrompt;
        const cluesTitle = document.createElement('h3'); cluesTitle.textContent = 'Look for';
        const clues = document.createElement('ul'); clues.className = 'clue-list'; entry.observedPattern.forEach((clue) => { const li = document.createElement('li'); li.textContent = clue; clues.append(li); });
        const protocolTitle = document.createElement('h3'); protocolTitle.textContent = 'Exact protocol';
        const protocol = document.createElement('ol'); protocol.className = 'protocol-list'; entry.requiredTreatments.forEach((treatment) => { const li = document.createElement('li'); li.textContent = labelForTreatment(treatment); protocol.append(li); });
        const warning = document.createElement('p'); warning.className = 'manual-warning'; warning.textContent = `Warning: ${entry.warning}`;
        card.append(title, prompt, cluesTitle, clues, protocolTitle, protocol, warning); manualGrid.append(card);
      });
    }
  };
})();
