import { apiFetch } from './api';
import { API_BASE_URL } from '../config';

export interface TransferSession {
  token: string;
  expiresAt: string;
  /** Полная ссылка для QR — ведёт на публичную страницу-визитку на сервере. */
  url: string;
}

export async function createCarTransfer(carId: string): Promise<TransferSession> {
  const { token, expiresAt } = await apiFetch<{ token: string; expiresAt: string }>(
    `/v1/cars/${carId}/transfer`,
    { method: 'POST' },
  );
  return { token, expiresAt, url: `${API_BASE_URL}/transfer?token=${token}` };
}

export async function cancelCarTransfer(token: string): Promise<void> {
  await apiFetch(`/v1/transfer/${token}/cancel`, { method: 'POST' });
}

export interface TransferPreview {
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  make: string;
  model: string;
  year: number;
  fromLabel: string;
}

/** Без авторизации — тот же публичный предпросмотр, что видно и на веб-странице до входа. */
export async function getCarTransferPreview(token: string): Promise<TransferPreview> {
  return apiFetch<TransferPreview>(`/v1/transfer/${token}`, { auth: false });
}

export interface AcceptedTransfer {
  carId: string;
  make: string;
  model: string;
  year: number;
}

export async function acceptCarTransfer(token: string): Promise<AcceptedTransfer> {
  return apiFetch<AcceptedTransfer>(`/v1/transfer/${token}/accept`, { method: 'POST' });
}
