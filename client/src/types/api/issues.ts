import type { IssueCommandResult, IssueInput, PageQuery } from '@waypoint/contracts/workflows';
export type IssuesListQuery = PageQuery;
export type IssuesFileReceiptIssueInput = IssueInput & { stage: 'RECEIPT' };
export type IssuesFileReceiptIssueResponse = IssueCommandResult;
export type IssuesFileLoadingIssueInput = IssueInput & { stage: 'LOADING' };
export type IssuesFileLoadingIssueResponse = IssueCommandResult;
export type IssuesFileDeliveryIssueInput = IssueInput & { stage: 'DELIVERY' };
export type IssuesFileDeliveryIssueResponse = IssueCommandResult;
export type IssuesResolveResponse = { id: string };
