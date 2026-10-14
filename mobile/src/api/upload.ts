import { localUriToBlob, postForm, resolveUploadUrl } from './client';

// Uploads a local image (a file:// URI from expo-image-picker) to the
// generic /api/upload endpoint and returns the absolute, RN-<Image>-safe
// URL. Shared by anywhere a photo needs to be attached to a record —
// device-taken/return photos today.
export async function uploadImage(uri: string): Promise<string> {
  const form = new FormData();
  const filename = uri.split('/').pop() || `photo-${Date.now()}.jpg`;
  const ext = filename.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await localUriToBlob(uri, mime);
  form.append('file', blob, filename);
  const res = await postForm<{ url: string }>('/upload', form);
  return resolveUploadUrl(res.url);
}

// Same endpoint, for the ad creatives that may be a short video.
export async function uploadMedia(uri: string, kind: 'image' | 'video'): Promise<string> {
  const form = new FormData();
  const filename = uri.split('/').pop() || `${kind}-${Date.now()}.${kind === 'video' ? 'mp4' : 'jpg'}`;
  const ext = filename.split('.').pop()?.toLowerCase();
  const mime =
    kind === 'video' ? (ext === 'webm' ? 'video/webm' : 'video/mp4') : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = await localUriToBlob(uri, mime);
  form.append('file', blob, filename);
  const res = await postForm<{ url: string }>('/upload', form);
  return resolveUploadUrl(res.url);
}

// Any picked file (a PDF header for a WhatsApp template, say) with its own
// mime type — the document picker supplies both.
export async function uploadFile(uri: string, name: string, mime: string): Promise<string> {
  const form = new FormData();
  const blob = await localUriToBlob(uri, mime);
  form.append('file', blob, name);
  const res = await postForm<{ url: string }>('/upload', form);
  return resolveUploadUrl(res.url);
}
