import { request, buildQuery } from '../http';
import type { IssueRow } from '@waypoint/contracts/workflows';
import type { Page } from '../../types/planning';
import type {
  IssuesListQuery,
  IssuesFileReceiptIssueInput,
  IssuesFileReceiptIssueResponse,
  IssuesFileLoadingIssueInput,
  IssuesFileLoadingIssueResponse,
  IssuesFileDeliveryIssueInput,
  IssuesFileDeliveryIssueResponse,
  IssuesResolveResponse,
} from '../../types/api/issues';

export const issuesApi = {
  list: (query?: IssuesListQuery) => request<Page<IssueRow>>(`/issues${buildQuery(query)}`),

  fileReceiptIssue: (issue: IssuesFileReceiptIssueInput) =>
    request<IssuesFileReceiptIssueResponse>('/issues', {
      method: 'POST',
      body: JSON.stringify(issue),
    }),

  fileLoadingIssue: (issue: IssuesFileLoadingIssueInput) =>
    request<IssuesFileLoadingIssueResponse>('/loading/issues', {
      method: 'POST',
      body: JSON.stringify(issue),
    }),

  fileDeliveryIssue: (issue: IssuesFileDeliveryIssueInput) =>
    request<IssuesFileDeliveryIssueResponse>('/delivery/issues', {
      method: 'POST',
      body: JSON.stringify(issue),
    }),

  resolve: (id: string, resolution: string) =>
    request<IssuesResolveResponse>(`/issues/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),
};
