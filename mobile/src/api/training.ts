import { dataGet, dataPost, api } from './client';

export interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  category: string;
  lesson_count: number;
  quiz_count: number;
  done_count: number;
  due_date: string | null;
  completed: number;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  type: string;
  media_url: string | null;
  content: string | null;
  position: number;
}

export interface CourseDetail {
  course: { id: string; title: string; description: string | null; category: string };
  lessons: Lesson[];
  doneLessonIds: string[];
  completion: { id: string; completed_at: string } | null;
}

export interface TrainingItem {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  url: string;
  active: number;
  position: number;
}

export interface WatchProgress {
  item_id: string;
  percent: number;
  seconds_watched: number;
  duration_seconds: number;
}

export interface TrainingCompletion {
  id: string;
  item_id: string;
  employee_id: string;
  completed_at: string;
}

export async function fetchMyCourses(): Promise<CourseSummary[]> {
  return api.get<CourseSummary[]>('/training/my');
}

export async function fetchCourseDetail(courseId: string): Promise<CourseDetail> {
  return api.get<CourseDetail>(`/training/course/${courseId}`);
}

export async function completeLesson(lessonId: string): Promise<void> {
  await api.post(`/training/lessons/${lessonId}/complete`);
}

export async function fetchTrainingItems(): Promise<TrainingItem[]> {
  return dataGet<TrainingItem[]>('training_items', {
    select: 'id,title,description,kind,url,active,position',
    eq: ['active:1'],
    order: 'position:asc',
  });
}

export async function fetchWatchProgress(): Promise<WatchProgress[]> {
  return api.get<WatchProgress[]>('/training/watch-progress/mine');
}

// Called periodically from the in-app player (VideoPlayerModal), not per
// frame — mirrors web's reportWatchProgress. The server keeps a high-water
// mark itself (never lets seconds_watched regress), so it's safe to call
// this on every progress ping without worrying about clobbering a further-
// along value from a previous viewing.
export async function reportWatchProgress(itemId: string, secondsWatched: number, durationSeconds: number): Promise<{ percent: number }> {
  return api.post<{ percent: number }>('/training/watch-progress', {
    item_id: itemId,
    seconds_watched: secondsWatched,
    duration_seconds: durationSeconds,
  });
}

export async function fetchMyCompletions(userId: string): Promise<TrainingCompletion[]> {
  return dataGet<TrainingCompletion[]>('training_completions', {
    select: '*',
    eq: [`employee_id:${userId}`],
  });
}

export async function markTutorialComplete(itemId: string, userId: string): Promise<void> {
  await dataPost('training_completions', {
    item_id: itemId,
    employee_id: userId,
    completed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
}
