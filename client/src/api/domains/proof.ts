import { request, buildQuery } from '../http';
import type { ProofUploadQuery, ProofUploadResponse } from '../../types/api/proof';

export const proofApi = {
  upload: (id: string, query: ProofUploadQuery, body: Blob | BufferSource, mimeType?: string) =>
    request<ProofUploadResponse>(`/proof/${encodeURIComponent(id)}${buildQuery(query)}`, {
      method: 'PUT',
      headers: mimeType ? { 'Content-Type': mimeType } : {},
      body,
    }),
  downloadUrl: (id: string) => `/api/v1/proof/${encodeURIComponent(id)}`,
};
