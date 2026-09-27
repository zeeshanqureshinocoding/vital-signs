'use strict';

/*
 * Scenario data is deliberately server-owned. `labReference` is the only
 * portion sent to the Lab client during a round; live patient data remains
 * restricted to the Medic.
 */
const SCENARIOS = Object.freeze([
  {
    id: 'septic-bloom',
    name: 'Septic Bloom',
    labReference: {
      diagnosisPrompt: 'Match fever, falling pressure, and rising pulse with a rapidly progressive bacterial source.',
      observedPattern: ['Fever above 39°C', 'Blood pressure progressively falling', 'Tachycardia', 'Emergent high-virulence alert'],
      requiredTreatments: ['broad-spectrum-antibiotic', 'iv-fluid-bolus', 'vasopressor'],
      warning: 'Fluid resuscitation is ineffective until antimicrobial coverage has begun.'
    },
    initialVitals: {
      heartRate: 108,
      systolic: 104,
      diastolic: 68,
      oxygen: 94,
      temperature: 39.1
    },
    progression: {
      heartRatePerSecond: 0.55,
      systolicPerSecond: -0.62,
      diastolicPerSecond: -0.35,
      oxygenPerSecond: -0.11,
      temperaturePerSecond: 0.018
    },
    symptomTimeline: [
      { atSecond: 0, id: 'high-virulence', label: 'High virulence markers detected', severity: 'warning' },
      { atSecond: 12, id: 'vascular-leak', label: 'Capillary leak pattern worsening', severity: 'warning' },
      { atSecond: 28, id: 'septic-shock', label: 'Impending septic shock', severity: 'critical' }
    ]
  },
  {
    id: 'respiratory-eclipse',
    name: 'Respiratory Eclipse',
    labReference: {
      diagnosisPrompt: 'Match a steep oxygen decline and high fever with a viral lower-respiratory process.',
      observedPattern: ['Oxygen saturation falling below 90%', 'Rapid breathing / rising pulse', 'Persistent fever', 'Diffuse alveolar inflammation alert'],
      requiredTreatments: ['antiviral', 'high-flow-oxygen', 'antipyretic'],
      warning: 'Oxygen alone supports the patient but does not arrest viral replication.'
    },
    initialVitals: {
      heartRate: 102,
      systolic: 118,
      diastolic: 76,
      oxygen: 91,
      temperature: 38.7
    },
    progression: {
      heartRatePerSecond: 0.46,
      systolicPerSecond: -0.16,
      diastolicPerSecond: -0.08,
      oxygenPerSecond: -0.31,
      temperaturePerSecond: 0.028
    },
    symptomTimeline: [
      { atSecond: 0, id: 'alveolar-inflammation', label: 'Diffuse alveolar inflammation detected', severity: 'warning' },
      { atSecond: 15, id: 'hypoxemia', label: 'Acute hypoxemia worsening', severity: 'critical' },
      { atSecond: 32, id: 'respiratory-fatigue', label: 'Respiratory fatigue imminent', severity: 'critical' }
    ]
  }
]);

function getScenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || null;
}

function getLabManual() {
  return SCENARIOS.map(({ id, name, labReference }) => ({ id, name, ...labReference }));
}

function pickScenario(random = Math.random) {
  return SCENARIOS[Math.floor(random() * SCENARIOS.length)];
}

module.exports = { SCENARIOS, getScenarioById, getLabManual, pickScenario };
