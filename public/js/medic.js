'use strict';

(() => {
  const treatments = [
    ['broad-spectrum-antibiotic', 'Broad-Spectrum Antibiotic'], ['iv-fluid-bolus', 'IV Fluid Bolus'], ['vasopressor', 'Vasopressor'],
    ['high-flow-oxygen', 'High-Flow Oxygen'], ['antiviral', 'Antiviral'], ['antipyretic', 'Antipyretic']
  ];
  const board = document.querySelector('#medic-board');
  const treatmentButtons = document.querySelector('#treatment-buttons');
  const feedback = document.querySelector('#treatment-feedback');
  const symptomList = document.querySelector('#symptom-list');
  const vitalNodes = { heartRate: document.querySelector('#heart-rate'), bloodPressure: document.querySelector('#blood-pressure'), oxygen: document.querySelector('#oxygen'), temperature: document.querySelector('#temperature') };

  treatments.forEach(([id, label]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'treatment-button'; button.dataset.treatment = id; button.textContent = label;
    button.addEventListener('click', () => window.VitalSigns.applyTreatment(id));
    treatmentButtons.append(button);
  });

  window.MedicUI = {
    show() { board.hidden = false; },
    updateVitals({ vitals, visibleSymptoms, treatmentProgress }) {
      vitalNodes.heartRate.textContent = vitals.heartRate;
      vitalNodes.bloodPressure.textContent = `${vitals.bloodPressure.systolic}/${vitals.bloodPressure.diastolic}`;
      vitalNodes.oxygen.textContent = vitals.oxygen;
      vitalNodes.temperature.textContent = vitals.temperature.toFixed(1);
      document.querySelector('#vitals-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}`;
      document.querySelector('#protocol-progress').textContent = `Protocol: ${treatmentProgress} step${treatmentProgress === 1 ? '' : 's'} accepted`;
      document.querySelector('#alert-count').textContent = `${visibleSymptoms.length} active`;
      symptomList.replaceChildren();
      if (!visibleSymptoms.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'No active biological alerts.'; symptomList.append(empty); }
      visibleSymptoms.forEach((symptom) => { const item = document.createElement('li'); item.className = `symptom symptom-${symptom.severity}`; item.innerHTML = `<span>${symptom.severity === 'critical' ? '!' : '•'}</span><strong></strong><small></small>`; item.querySelector('strong').textContent = symptom.label; item.querySelector('small').textContent = symptom.severity; symptomList.append(item); });
    },
    treatmentResult(result) {
      feedback.textContent = result.message;
      feedback.className = `treatment-feedback ${result.correct ? 'is-success' : 'is-error'}`;
      const button = treatmentButtons.querySelector(`[data-treatment="${result.treatmentId}"]`);
      if (button) { button.classList.add(result.correct ? 'was-correct' : 'was-incorrect'); setTimeout(() => button.classList.remove('was-correct', 'was-incorrect'), 700); }
    },
    beginRound() {
      treatmentButtons.querySelectorAll('button').forEach((button) => {
        button.disabled = false;
        button.classList.remove('was-correct', 'was-incorrect');
      });
      feedback.textContent = 'Awaiting Lab instruction.';
      feedback.className = 'treatment-feedback';
    },
    disableTreatments() { treatmentButtons.querySelectorAll('button').forEach((button) => { button.disabled = true; }); }
  };
})();
