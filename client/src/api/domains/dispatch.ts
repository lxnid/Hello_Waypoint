import { request } from '../http';
import type { Reference } from '../../types/planning';

export const dispatchApi = {
  reference: () => request<Reference>('/dispatch/reference'),
};
