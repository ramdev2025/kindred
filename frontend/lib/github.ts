import { api } from './api';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
}

export async function getGitHubAuthUrl(token: string): Promise<string> {
  const res = await api.get('/api/github/auth', {
    headers: { Authorization: `Bearer ${token}` },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return res.data.url;
}

export async function getGitHubStatus(token: string): Promise<{ connected: boolean; username?: string }> {
  const res = await api.get('/api/github/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function getGitHubRepos(token: string): Promise<GitHubRepo[]> {
  const res = await api.get('/api/github/repos', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.repos;
}

export async function importRepo(
  token: string,
  owner: string,
  repo: string
): Promise<Array<{ path: string; content: string }>> {
  const res = await api.post('/api/github/import', { owner, repo }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.files;
}

export async function pushToRepo(
  token: string,
  data: { owner: string; repo: string; branch: string; files: Array<{ path: string; content: string }> ; message?: string }
): Promise<{ success: boolean; sha?: string }> {
  const res = await api.post('/api/github/push', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function createPullRequest(
  token: string,
  data: { owner: string; repo: string; title: string; body?: string; head: string; base: string }
): Promise<{ url: string; number: number }> {
  const res = await api.post('/api/github/create-pr', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
