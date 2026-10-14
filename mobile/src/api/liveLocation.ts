import { api } from './client';

export async function pingLocation(lat: number, lng: number, accuracy?: number): Promise<void> {
  await api.post('/live-location/ping', { lat, lng, accuracy });
}

export interface LiveLocationRow {
  user_id: string;
  full_name: string;
  worker_type: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
}

interface RawLiveLocationRow {
  user_id: string;
  full_name: string;
  worker_type: string | null;
  latitude: number | string;
  longitude: number | string;
  accuracy: number | string | null;
  updated_at: string;
}

export async function fetchLiveLocations(): Promise<LiveLocationRow[]> {
  const rows = await api.get<RawLiveLocationRow[]>('/live-location');
  return rows.map((r) => ({
    ...r,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
  }));
}

// One employee's recorded route for a day (the Day Trail). Oldest point first.
export interface TrailPoint {
  lat: number;
  lng: number;
  t: number;
  accuracy: number | null;
}

export async function fetchLocationHistory(userId: string, date: string): Promise<TrailPoint[]> {
  const rows = await api.get<{ latitude: number | string; longitude: number | string; accuracy: number | string | null; recorded_at: string }[]>(
    `/live-location/history?user_id=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`,
  );
  return rows.map((r) => ({
    lat: Number(r.latitude),
    lng: Number(r.longitude),
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    t: new Date(r.recorded_at).getTime(),
  }));
}
