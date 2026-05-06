import { api } from './api';

export interface DatabaseConnection {
  id: string;
  name: string;
  provider: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  ssl_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TableSchema {
  table_name: string;
  columns: Array<{ column_name: string; data_type: string; is_nullable: string }>;
}

export async function connectDatabase(
  token: string,
  data: {
    name: string;
    provider: string;
    host: string;
    port: number;
    database_name: string;
    username: string;
    password: string;
    ssl_enabled?: boolean;
  }
): Promise<DatabaseConnection> {
  const res = await api.post('/api/databases/connect', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.connection;
}

export async function fetchDatabases(token: string): Promise<DatabaseConnection[]> {
  const res = await api.get('/api/databases', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.connections;
}

export async function deleteDatabase(token: string, id: string): Promise<void> {
  await api.delete(`/api/databases/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function queryDatabase(
  token: string,
  id: string,
  sql: string
): Promise<{ rows: any[]; fields: string[] }> {
  const res = await api.post(`/api/databases/${id}/query`, { sql }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function getDatabaseSchema(token: string, id: string): Promise<TableSchema[]> {
  const res = await api.get(`/api/databases/${id}/schema`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.tables;
}
