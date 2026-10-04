import type { AttachmentQuery } from '@waypoint/contracts/workflows';
export type ProofUploadQuery = AttachmentQuery;
export type ProofUploadResponse = { id: string; checksum: string; byteSize: number };
