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
