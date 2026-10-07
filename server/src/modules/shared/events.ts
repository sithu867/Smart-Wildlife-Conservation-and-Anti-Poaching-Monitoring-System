import { EventEmitter } from 'events';

class AppEventEmitter extends EventEmitter {}

export const appEventEmitter = new AppEventEmitter();

export const EVENTS = {
  COLLAR_TELEMETRY_RECEIVED: 'COLLAR_TELEMETRY_RECEIVED',
  ALERT_CREATED: 'ALERT_CREATED',
  ALERT_UPDATED: 'ALERT_UPDATED'
} as const;
