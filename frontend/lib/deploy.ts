import { api } from './api';

export interface Deployment {
  id: string;
  project_id: string;
  provider: string;
  url: string | null;
  status: string;
  config: Record<string, any>;
  logs: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function deployToVercel(
  token: string,
  data: { projectId: string; name: string; envVars?: Record<string, string>; files: Array<{ path: string; content: string }> }
): Promise<Deployment> {
  const res = await api.post('/api/deploy/vercel', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.deployment;
}

export async function deployToNetlify(
  token: string,
  data: { projectId: string; name: string; envVars?: Record<string, string>; files: Array<{ path: string; content: string }> }
): Promise<Deployment> {
  const res = await api.post('/api/deploy/netlify', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.deployment;
}

export async function deployToCloudRun(
  token: string,
  data: { projectId: string; name: string; envVars?: Record<string, string>; files: Array<{ path: string; content: string }> }
): Promise<Deployment> {
  const res = await api.post('/api/deploy/cloudrun', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.deployment;
}

export async function getDeployStatus(token: string, deployId: string): Promise<Deployment> {
  const res = await api.get(`/api/deploy/status/${deployId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.deployment;
}

export async function getDeployHistory(token: string, projectId: string): Promise<Deployment[]> {
  const res = await api.get(`/api/deploy/history/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.deployments;
}
