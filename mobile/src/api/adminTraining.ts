import { api, dataGet } from './client';

export interface CourseBody {
  title: string;
  category: string;
  description: string;
}

export const createCourse = (b: CourseBody) => api.post<{ id: string }>('/training/courses', b);
export const updateCourse = (id: string, b: Partial<CourseBody>) => api.patch(`/training/courses/${encodeURIComponent(id)}`, b);
export const deleteCourse = (id: string) => api.del(`/training/courses/${encodeURIComponent(id)}`);

export interface FullLesson {
  id: string;
  title: string;
  type: string;
  media_url: string | null;
  content: string | null;
}
export interface FullQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
}
export interface FullAssignment {
  employee_id: string | null;
  due_date: string | null;
}
export interface FullCourse {
  course: { id: string; title: string; description: string | null; category: string | null; active: number };
  lessons: FullLesson[];
  quiz: FullQuestion[];
  assignments: FullAssignment[];
}

export const fetchFullCourse = (id: string) => api.get<FullCourse>(`/training/courses/${encodeURIComponent(id)}/full`);

export const addLesson = (courseId: string, b: { title: string; type: string; media_url: string | null; content: string; position: number }) =>
  api.post<{ id: string }>(`/training/courses/${encodeURIComponent(courseId)}/lessons`, b);
export const removeLesson = (id: string) => api.del(`/training/lessons/${encodeURIComponent(id)}`);

export const addQuestion = (courseId: string, b: { question: string; options: string[]; correct_index: number; position: number }) =>
  api.post<{ id: string }>(`/training/courses/${encodeURIComponent(courseId)}/quiz`, b);
export const removeQuestion = (id: string) => api.del(`/training/quiz/${encodeURIComponent(id)}`);

export const assignCourse = (courseId: string, b: { all: true; due_date: string | null } | { employee_ids: string[]; due_date: string | null }) =>
  api.post(`/training/courses/${encodeURIComponent(courseId)}/assign`, b);

export interface PlainEmployee {
  id: string;
  full_name: string | null;
}
export const fetchTrainingEmployees = () => dataGet<PlainEmployee[]>('profiles', { select: 'id,full_name', eq: 'role:employee' });

// Fill-in-the-blank and image questions pack their extras into the question
// column as a JSON envelope — the format the web editor and the player share.
export const packQuestion = (o: { t: 'fill' | 'image'; text: string; img?: string | null }) => JSON.stringify({ _qz: 1, ...o });

// ── Quiz questions from a CSV (Type, Question, OptionA-D, Correct, ImageURL) ──
export interface QuizBody {
  question: string;
  options: string[];
  correct_index: number;
}

export const QUIZ_SAMPLE: Record<string, string>[] = [
  { Type: 'mcq', Question: 'Which cable carries video for an analog CCTV camera?', OptionA: 'Coaxial', OptionB: 'HDMI', OptionC: 'Audio', OptionD: 'VGA', Correct: 'A', ImageURL: '' },
  { Type: 'fill', Question: 'The default RTSP port is ___', OptionA: '554', OptionB: '80', OptionC: '8080', OptionD: '443', Correct: 'A', ImageURL: '' },
  { Type: 'image', Question: 'Which device is shown in the image?', OptionA: 'DVR', OptionB: 'NVR', OptionC: 'Network Switch', OptionD: 'Router', Correct: 'C', ImageURL: 'https://example.com/your-image.jpg' },
  { Type: 'match', Question: 'Match the device to its purpose', OptionA: 'DVR=Records analog CCTV footage', OptionB: 'Switch=Connects LAN devices', OptionC: 'Biometric=Marks attendance', OptionD: 'VDP=Video door communication', Correct: '', ImageURL: '' },
];

const uid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// Same rules as the web importer. Match-the-following makes one row per pair
// (same group id) so the server's index-based grading keeps working.
export function quizBodiesFromRows(rows: string[][]): { bodies: QuizBody[]; errors: string[] } {
  const bodies: QuizBody[] = [];
  const errors: string[] = [];
  if (rows.length < 2) return { bodies, errors: ['The file has no question rows'] };
  const heads = rows[0].map((h) => String(h).toLowerCase().replace(/[^a-z]/g, ''));
  rows.slice(1).forEach((cells, idx) => {
    const r: Record<string, string> = {};
    heads.forEach((h, i) => {
      r[h] = String(cells[i] ?? '').trim();
    });
    const line = idx + 2;
    const type = (r.type || 'mcq').toLowerCase();
    const text = r.question || '';
    const img = r.imageurl || r.image || null;
    const opts = ['optiona', 'optionb', 'optionc', 'optiond'].map((k) => r[k] || '').filter(Boolean);
    if (!text) {
      errors.push(`Row ${line}: question is empty`);
      return;
    }
    if (type === 'match') {
      const pairs = opts
        .map((p) => {
          const i = p.indexOf('=');
          return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : null;
        })
        .filter((p): p is string[] => !!p && !!p[0] && !!p[1]);
      if (pairs.length < 2) {
        errors.push(`Row ${line}: match needs at least 2 "Left=Right" pairs in the Option columns`);
        return;
      }
      const group = uid();
      const rights = pairs.map((p) => p[1]);
      pairs.forEach((p, i) => bodies.push({ question: JSON.stringify({ _qz: 1, t: 'match', text, gtitle: text, left: p[0], group }), options: rights, correct_index: i }));
      return;
    }
    if (opts.length < 2) {
      errors.push(`Row ${line}: needs at least 2 options`);
      return;
    }
    const cRaw = r.correct || r.correctanswer || 'A';
    let correct = 'ABCD'.indexOf(cRaw.toUpperCase());
    if (correct === -1 && /^[1-4]$/.test(cRaw)) correct = Number(cRaw) - 1;
    if (correct === -1) correct = opts.findIndex((o) => o.toLowerCase() === cRaw.toLowerCase());
    if (correct < 0 || correct >= opts.length) {
      errors.push(`Row ${line}: Correct must be A–D, 1–4, or match an option`);
      return;
    }
    if (type === 'fill' && !/_{2,}/.test(text)) {
      errors.push(`Row ${line}: fill questions need a blank written as ___ in the question`);
      return;
    }
    const t = type === 'image' || (img && type === 'mcq') ? 'image' : type === 'fill' ? 'fill' : 'mcq';
    bodies.push({ question: t === 'mcq' ? text : JSON.stringify({ _qz: 1, t, text, img }), options: opts, correct_index: correct });
  });
  return { bodies, errors };
}

export async function importQuizBodies(courseId: string, bodies: QuizBody[], startAt: number): Promise<number> {
  let n = 0;
  for (const b of bodies) {
    await addQuestion(courseId, { ...b, position: startAt + n });
    n++;
  }
  return n;
}
