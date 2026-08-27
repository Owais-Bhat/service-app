import { api, localUriToBlob, postForm } from './client';

export type ReviewType = 'google' | 'job_card' | 'sms';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewSubmission {
  id: string;
  inquiry_id: string | null;
  employee_id: string;
  review_type: ReviewType;
  photo_url: string | null;
  claimed_customer_name: string | null;
  claimed_address: string | null;
  star_rating: number | null;
  points: number | null;
  status: ReviewStatus;
  admin_note: string | null;
  created_at: string;
  ticket_no?: string | null;
  customer_name?: string | null;
}

export interface ResolvedJob {
  id: string;
  ticket_no: string | null;
  full_name: string;
}

async function appendPhotoField(form: FormData, field: string, uri: string): Promise<void> {
  const filename = uri.split('/').pop() || `photo-${Date.now()}.jpg`;
  const ext = filename.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await localUriToBlob(uri, mime);
  form.append(field, blob, filename);
}

export async function fetchMyReviewSubmissions(): Promise<ReviewSubmission[]> {
  return api.get<ReviewSubmission[]>('/review-submissions/mine');
}

// Employee's own completed (resolved/case_closed/foc) jobs eligible for a
// Service-type claim — server re-validates ownership + status again on
// submit, this list is just for picking.
export async function fetchResolvedJobsForReview(): Promise<ResolvedJob[]> {
  return api.get<ResolvedJob[]>('/review-submissions/resolved-jobs');
}

// Service claim: one Google Review screenshot against a specific ticket —
// up to 30 points (5-star only), scored by admin on approval.
export async function submitServiceReview(inquiryId: string, photoUri: string): Promise<ReviewSubmission> {
  const form = new FormData();
  form.append('inquiry_id', inquiryId);
  form.append('policy_agreed', 'true');
  await appendPhotoField(form, 'photo', photoUri);
  return postForm<ReviewSubmission>('/review-submissions/service', form);
}

// Installation claim: no ticket link — hand-typed customer/address, plus a
// Google Review photo, a Job Card photo, or both (each becomes its own
// submission row, scored independently by admin).
export async function submitInstallationReview(
  customerName: string,
  address: string,
  googlePhotoUri: string | null,
  jobCardPhotoUri: string | null,
): Promise<ReviewSubmission[]> {
  const form = new FormData();
  form.append('customer_name', customerName);
  form.append('address', address);
  form.append('policy_agreed', 'true');
  if (googlePhotoUri) await appendPhotoField(form, 'google_photo', googlePhotoUri);
  if (jobCardPhotoUri) await appendPhotoField(form, 'job_card_photo', jobCardPhotoUri);
  return postForm<ReviewSubmission[]>('/review-submissions/installation', form);
}
