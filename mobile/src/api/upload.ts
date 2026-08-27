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
