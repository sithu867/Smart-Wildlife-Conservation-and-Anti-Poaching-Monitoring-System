import { http } from './http';
export type HealthResponse = { success: true; data: { status: string; service: string; timestamp: string } };
export async function getHealth(): Promise<HealthResponse> { const response = await http.get<HealthResponse>('/health'); return response.data; }
