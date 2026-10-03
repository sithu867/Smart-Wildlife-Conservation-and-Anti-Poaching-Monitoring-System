import mongoose, { Schema, Document } from 'mongoose';
import { PatrolStatus, SyncStatus, LocationSource } from '../../types/enums.js';

export interface IPark extends Document {
  name: string;
  code: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ParkSchema = new Schema<IPark>({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: { type: String },
}, { timestamps: true });

export interface IPatrolRoute extends Document {
  name: string;
  park: mongoose.Types.ObjectId;
  description: string;
  distanceKm: number;
  estimatedDurationHours: number;
  geometry: {
    type: string;
    coordinates: number[][]; // Array of [longitude, latitude]
  };
  createdAt: Date;
  updatedAt: Date;
}

const PatrolRouteSchema = new Schema<IPatrolRoute>({
  name: { type: String, required: true },
  park: { type: Schema.Types.ObjectId, ref: 'Park', required: true, index: true },
  description: { type: String, required: true },
  distanceKm: { type: Number, required: true },
  estimatedDurationHours: { type: Number, required: true },
  geometry: {
    type: { type: String, enum: ['LineString'], default: 'LineString' },
    coordinates: { type: [[Number]], required: true }
  }
}, { timestamps: true });

export interface IPatrolAssignment extends Document {
  rangerId: string;
  rangerName: string;
  patrolRoute: mongoose.Types.ObjectId;
  assignedDate: Date;
  status: PatrolStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PatrolAssignmentSchema = new Schema<IPatrolAssignment>({
  rangerId: { type: String, required: true, index: true },
  rangerName: { type: String, required: true },
  patrolRoute: { type: Schema.Types.ObjectId, ref: 'PatrolRoute', required: true },
  assignedDate: { type: Date, default: Date.now },
  status: { type: String, enum: Object.values(PatrolStatus), default: PatrolStatus.ASSIGNED, index: true },
  notes: { type: String }
}, { timestamps: true });

export interface IWaypoint {
  _id?: mongoose.Types.ObjectId;
  latitude: number;
  longitude: number;
  timestamp: Date;
  source: LocationSource;
  accuracy?: number;
  note?: string;
}

const WaypointSchema = new Schema<IWaypoint>({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  timestamp: { type: Date, required: true, default: Date.now },
  source: { type: String, enum: Object.values(LocationSource), required: true },
  accuracy: { type: Number },
  note: { type: String }
});

export interface IPatrolSession extends Document {
  clientSessionId?: string;
  rangerId: string;
  rangerName: string;
  patrolAssignment: mongoose.Types.ObjectId;
  patrolRoute: mongoose.Types.ObjectId;
  startTime: Date;
  endTime?: Date | null;
  status: PatrolStatus;
  syncStatus: SyncStatus;
  waypoints: IWaypoint[];
  totalDistanceKm: number;
  durationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

const PatrolSessionSchema = new Schema<IPatrolSession>({
  clientSessionId: { type: String, index: true, sparse: true },
  rangerId: { type: String, required: true, index: true },
  rangerName: { type: String, required: true },
  patrolAssignment: { type: Schema.Types.ObjectId, ref: 'PatrolAssignment', required: true, index: true },
  patrolRoute: { type: Schema.Types.ObjectId, ref: 'PatrolRoute', required: true },
  startTime: { type: Date, required: true, default: Date.now },
  endTime: { type: Date, default: null },
  status: { type: String, enum: Object.values(PatrolStatus), default: PatrolStatus.ACTIVE, index: true },
  syncStatus: { type: String, enum: Object.values(SyncStatus), default: SyncStatus.SYNCED },
  waypoints: [WaypointSchema],
  totalDistanceKm: { type: Number, default: 0 },
  durationSeconds: { type: Number, default: 0 }
}, { timestamps: true });

export const ParkModel = mongoose.models.Park || mongoose.model<IPark>('Park', ParkSchema);
export const PatrolRouteModel = mongoose.models.PatrolRoute || mongoose.model<IPatrolRoute>('PatrolRoute', PatrolRouteSchema);
export const PatrolAssignmentModel = mongoose.models.PatrolAssignment || mongoose.model<IPatrolAssignment>('PatrolAssignment', PatrolAssignmentSchema);
export const PatrolSessionModel = mongoose.models.PatrolSession || mongoose.model<IPatrolSession>('PatrolSession', PatrolSessionSchema);
