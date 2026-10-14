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

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

// The database stores every question as (question TEXT, options JSON,
// correct_index). Fill-in-the-blank, image and match-the-following questions
// pack their extras into the question column as a JSON envelope (_qz) — the
// same one the web course editor writes. Plain text is a multiple-choice question.
export interface DecodedQuestion {
  kind: 'mcq' | 'fill' | 'image' | 'match';
  text: string;
  img: string | null;
  group: string | null;
  groupTitle: string;
  left: string;
}

export function decodeQuestion(raw: string | null | undefined): DecodedQuestion {
  const s = String(raw || '');
  if (s[0] === '{' && s.includes('"_qz"')) {
    try {
      const o = JSON.parse(s);
      const kind = ['fill', 'image', 'match'].includes(o.t) ? o.t : 'mcq';
      return { kind, text: String(o.text || ''), img: o.img || null, group: o.group || null, groupTitle: String(o.gtitle || ''), left: String(o.left || '') };
    } catch {
      /* fall through to plain text */
    }
  }
  return { kind: 'mcq', text: s, img: null, group: null, groupTitle: '', left: '' };
}

// What to print as the question line.
export function questionLabel(d: DecodedQuestion): string {
  if (d.kind === 'match') return d.left || d.text;
  if (d.kind === 'fill') return d.text.replace(/_{2,}/g, '________');
  return d.text;
}

export interface QuizResultItem {
  id: string;
  correct_index: number;
  chosen: number | null;
  correct: boolean;
}

export interface QuizSubmitResult {
  score: number;
  passed: boolean;
  results: QuizResultItem[];
}

export interface CourseDetail {
  course: { id: string; title: string; description: string | null; category: string };
  lessons: Lesson[];
  quiz: QuizQuestion[];
  doneLessonIds: string[];
  // Real course-pass status. When the course has a quiz, this only gets set
  // by quiz-submit (score >= 70) — completing every lesson is not itself
  // enough, and a quiz-less course auto-passes on submitting an empty quiz.
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

// answers keys are quiz question ids, values are the chosen option index.
export async function submitQuiz(courseId: string, answers: Record<string, number>): Promise<QuizSubmitResult> {
  return api.post<QuizSubmitResult>(`/training/course/${courseId}/quiz-submit`, { answers });
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
