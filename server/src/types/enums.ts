export enum SyncStatus {
  LOCAL = 'LOCAL',
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED'
}

export enum PatrolStatus {
  ASSIGNED = 'ASSIGNED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED'
}

export enum LocationSource {
  GPS = 'GPS',
  MANUAL = 'MANUAL'
}

export enum IncidentType {
  SNARE = 'SNARE',
  ANIMAL_CARCASS = 'ANIMAL_CARCASS',
  ILLEGAL_CAMPSITE = 'ILLEGAL_CAMPSITE',
  AT_RISK_FOOTPRINTS = 'AT_RISK_FOOTPRINTS',
  OTHER = 'OTHER'
}

export enum IncidentStatus {
  REPORTED = 'REPORTED',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED'
}

