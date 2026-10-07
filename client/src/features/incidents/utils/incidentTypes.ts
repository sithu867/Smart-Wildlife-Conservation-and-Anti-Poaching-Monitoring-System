import { IncidentType } from '../../../shared/types/enums';

export const INCIDENT_TYPE_OPTIONS = [
  { type: IncidentType.SNARE, label: 'Wire Snare / Trap', icon: '🪤', desc: 'Illegal animal snares, traps, or nets' },
  { type: IncidentType.ANIMAL_CARCASS, label: 'Animal Carcass', icon: '🦴', desc: 'Deceased animal or suspected poaching kill' },
  { type: IncidentType.ILLEGAL_CAMPSITE, label: 'Illegal Campsite', icon: '⛺', desc: 'Unauthorized human encampments or firepits' },
  { type: IncidentType.AT_RISK_FOOTPRINTS, label: 'Species Tracks', icon: '🐾', desc: 'Footprints or signs of endangered species' },
  { type: IncidentType.OTHER, label: 'Other Threat', icon: '⚠️', desc: 'Fencing breaches, logging, or other threats' }
];

export function incidentTypeLabel(type: IncidentType): string {
  return INCIDENT_TYPE_OPTIONS.find(opt => opt.type === type)?.label ?? type;
}
