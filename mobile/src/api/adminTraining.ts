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
