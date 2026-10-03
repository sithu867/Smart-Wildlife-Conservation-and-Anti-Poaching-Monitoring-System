import { useState, useEffect, useCallback, useRef } from 'react';
import { patrolApi } from '../api/patrolApi';
import { geolocationService, type GeoLocation, type GeoError } from '../../../shared/geolocation/geolocation';
import { LocationSource, PatrolStatus, SyncStatus } from '../../../shared/types/enums';
import type { PatrolAssignment, PatrolSession, Waypoint } from '../types/patrol';

export function usePatrol(sessionIdParam?: string) {
  const [assignment, setAssignment] = useState<PatrolAssignment | null>(null);
  const [session, setSession] = useState<PatrolSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<GeoLocation | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'tracking' | 'error' | 'denied' | 'unavailable'>('idle');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const watchIdRef = useRef<number | null>(null);
  const lastWaypointTimeRef = useRef<number>(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (sessionIdParam) {
        const fetchedSession = await patrolApi.getSessionById(sessionIdParam);
        setSession(fetchedSession);
      } else {
        const { assignment: fetchedAssignment, activeSession } = await patrolApi.getMyAssignment();
        setAssignment(fetchedAssignment);
        if (activeSession) {
          setSession(activeSession);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patrol assignment');
    } finally {
      setLoading(false);
    }
  }, [sessionIdParam]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Timer for active patrol session elapsed time
  useEffect(() => {
    if (!session || session.status !== PatrolStatus.ACTIVE) {
      return;
    }

    const startMs = new Date(session.startTime).getTime();
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsedSeconds(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session]);

  // GPS position handler callback
  const handleGpsLocation = useCallback(
    async (location: GeoLocation) => {
      // Validate coordinates
      if (location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180) {
        console.warn('Rejected invalid GPS coordinates fix:', location);
        return;
      }

      setCurrentLocation(location);
      setGpsState('tracking');
      setGpsErrorMsg(null);

      // Auto-record GPS waypoint if patrol is active and min 10s elapsed
      if (session && session.status === PatrolStatus.ACTIVE) {
        const now = Date.now();
        if (now - lastWaypointTimeRef.current >= 10000) {
          lastWaypointTimeRef.current = now;
          try {
            const updatedSession = await patrolApi.addWaypoint(session._id, {
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: new Date(location.timestamp).toISOString(),
              source: LocationSource.GPS,
              accuracy: location.accuracy
            });
            setSession(updatedSession);
          } catch (err) {
            console.error('Failed to auto-record GPS waypoint:', err);
          }
        }
      }
    },
    [session]
  );

  const handleGpsError = useCallback((gpsErr: GeoError) => {
    console.warn('GPS location error:', gpsErr);
    if (gpsErr.code === 1) {
      setGpsState('denied');
      setGpsErrorMsg('Location permission denied by user. Manual waypoints are still enabled.');
    } else if (gpsErr.code === 2) {
      setGpsState('unavailable');
      setGpsErrorMsg('GPS signal lost or position unavailable. Patrol continues.');
    } else {
      setGpsState('error');
      setGpsErrorMsg(gpsErr.message || 'GPS location error. Patrol continues.');
    }
  }, []);

  // Start GPS tracking when patrol becomes ACTIVE
  useEffect(() => {
    if (session && session.status === PatrolStatus.ACTIVE) {
      setGpsState('tracking');
      const id = geolocationService.startTracking(handleGpsLocation, handleGpsError);
      watchIdRef.current = id;
      return () => {
        if (watchIdRef.current !== null) {
          geolocationService.stopTracking(watchIdRef.current);
          watchIdRef.current = null;
        }
      };
    } else {
      setGpsState('idle');
      if (watchIdRef.current !== null) {
        geolocationService.stopTracking(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
  }, [session?.status, handleGpsLocation, handleGpsError, session?._id]);

  const startPatrol = async () => {
    setError(null);
    try {
      const assignmentId = assignment?._id;
      const newSession = await patrolApi.startPatrol(assignmentId);
      setSession(newSession);
      return newSession;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start patrol session.';
      setError(msg);
      throw new Error(msg);
    }
  };

  const addManualWaypoint = async (note?: string, customLat?: number, customLng?: number) => {
    if (!session || session.status !== PatrolStatus.ACTIVE) {
      throw new Error('No active patrol session to record waypoint.');
    }

    const lat = customLat ?? currentLocation?.latitude;
    const lng = customLng ?? currentLocation?.longitude;

    if (lat === undefined || lng === undefined) {
      throw new Error('GPS coordinates unavailable. Please grant location permission or enter valid coordinates.');
    }

    try {
      const updatedSession = await patrolApi.addWaypoint(session._id, {
        latitude: lat,
        longitude: lng,
        timestamp: new Date().toISOString(),
        source: LocationSource.MANUAL,
        accuracy: currentLocation?.accuracy,
        note
      });
      setSession(updatedSession);
      return updatedSession;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to record manual waypoint.';
      setError(msg);
      throw new Error(msg);
    }
  };

  const completePatrol = async () => {
    if (!session || session.status !== PatrolStatus.ACTIVE) {
      throw new Error('No active patrol session to complete.');
    }

    try {
      if (watchIdRef.current !== null) {
        geolocationService.stopTracking(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsState('idle');

      const completedSession = await patrolApi.completePatrol(session._id);
      setSession(completedSession);
      return completedSession;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Patrol could not be completed.';
      setError(msg);
      throw new Error(msg);
    }
  };

  const formatElapsedTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
  };

  return {
    assignment,
    session,
    loading,
    error,
    currentLocation,
    gpsState,
    gpsErrorMsg,
    elapsedSeconds,
    formattedElapsedTime: formatElapsedTime(elapsedSeconds),
    startPatrol,
    addManualWaypoint,
    completePatrol,
    refresh: loadData
  };
}
