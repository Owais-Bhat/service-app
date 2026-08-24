import { api } from './client';

// Matches the server's actual /api/leaderboard response — ranked by review
// count (then average rating, then 5-star count), computed from
// inquiries.feedback_rating. Same shape web's renderEmployeeLeaderboard()
// consumes.
export interface LeaderboardEntry {
  id: string;
  name: string;
  count: number;
  avg: number;
  fiveStars: number;
}

export interface LeaderboardResponse {
  monthly: LeaderboardEntry[];
  allTime: LeaderboardEntry[];
}

const currentMonthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  return api.get<LeaderboardResponse>(`/leaderboard?month=${currentMonthKey()}`);
}
