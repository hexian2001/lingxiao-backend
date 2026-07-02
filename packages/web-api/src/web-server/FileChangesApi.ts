/**
 * Re-export from canonical location.
 * The implementation now lives in @lingxiao-office/sdk (packages/sdk/src/web-server/FileChangesApi.ts).
 * web-api keeps this shim so local sibling imports (./FileChangesApi.js) stay valid.
 */
export {
  FileChangesApi,
  type TurnCheckpointGroup,
  type SessionCheckpointGroup,
} from '@lingxiao-office/sdk/web-server/FileChangesApi.js';
