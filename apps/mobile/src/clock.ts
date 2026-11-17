import * as Location from 'expo-location';
import { post } from './api';

/** Clock in/out with the phone's GPS position (the API enforces the office geofence when configured). */
export async function clock(action: 'in' | 'out', photo?: string | null) {
  let coords: { lat: number; lng: number; accuracy?: number } | {} = {};
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status === 'granted') {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 12000)),
    ]).catch(() => null);
    const p = pos ?? (await Location.getLastKnownPositionAsync().catch(() => null));
    if (p) coords = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? undefined };
  }
  return post('/me/attendance/clock', { action, ...coords, ...(photo ? { photo } : {}) });
}
