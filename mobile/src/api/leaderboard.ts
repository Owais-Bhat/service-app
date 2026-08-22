import { api } from './client';

export interface LeaderboardEntry {
  employeeId: string;
  name: string;
  avgRating: number | null;
  avgTimeEfficiency: number | null;
  jobsCount: number;
  combinedScore: number;
}

export interface LeaderboardResponse {
  month: string;
  leaderboard: LeaderboardEntry[];
}

const currentMonthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  return api.get<LeaderboardResponse>(`/leaderboard?month=${currentMonthKey()}`);
}
