'use strict';

const GAME_DURATION_MS = 60_000;
const TICK_INTERVAL_MS = 1_000;
const ROOM_CODE_LENGTH = 4;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 15 * 60_000;
const RECONNECT_GRACE_MS = 20_000;
const MAX_TREATMENTS_PER_SECOND = 3;
const INCORRECT_TREATMENT_TIME_PENALTY_MS = 5_000;
const INCORRECT_TREATMENT_SEVERITY_PENALTY = 12;

const ROLES = Object.freeze({
  MEDIC: 'medic',
  LAB: 'lab'
});

const GAME_STATUS = Object.freeze({
  WAITING: 'waiting',
  ACTIVE: 'active',
  WON: 'won',
  LOST: 'lost',
  FINISHED: 'finished'
});

const TREATMENTS = Object.freeze([
  { id: 'broad-spectrum-antibiotic', label: 'Broad-Spectrum Antibiotic' },
  { id: 'iv-fluid-bolus', label: 'IV Fluid Bolus' },
  { id: 'vasopressor', label: 'Vasopressor' },
  { id: 'high-flow-oxygen', label: 'High-Flow Oxygen' },
  { id: 'antiviral', label: 'Antiviral' },
  { id: 'antipyretic', label: 'Antipyretic' }
]);

const TREATMENT_IDS = new Set(TREATMENTS.map(({ id }) => id));

module.exports = {
  GAME_DURATION_MS,
  TICK_INTERVAL_MS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_TTL_MS,
  RECONNECT_GRACE_MS,
  MAX_TREATMENTS_PER_SECOND,
  INCORRECT_TREATMENT_TIME_PENALTY_MS,
  INCORRECT_TREATMENT_SEVERITY_PENALTY,
  ROLES,
  GAME_STATUS,
  TREATMENTS,
  TREATMENT_IDS
};
