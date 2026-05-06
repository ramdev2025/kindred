import { api } from './api';

export interface GoogleDoc {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export async function getGoogleAuthUrl(token: string): Promise<string> {
  const res = await api.get('/api/google/auth', {
    headers: { Authorization: `Bearer ${token}` },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return res.data.url;
}

export async function getGoogleStatus(token: string): Promise<{ connected: boolean; email?: string }> {
  const res = await api.get('/api/google/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function getGoogleDocs(token: string): Promise<GoogleDoc[]> {
  const res = await api.get('/api/google/docs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.docs;
}

export async function getGoogleSheets(token: string): Promise<GoogleDoc[]> {
  const res = await api.get('/api/google/sheets', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.sheets;
}

export async function importDoc(
  token: string,
  docId: string
): Promise<{ title: string; content: string }> {
  const res = await api.post('/api/google/import-doc', { docId }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function exportToDrive(
  token: string,
  data: { name: string; content: string; mimeType?: string }
): Promise<{ fileId: string; url: string }> {
  const res = await api.post('/api/google/export', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
