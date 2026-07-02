/**
 * Re-export from canonical location.
 * The implementation now lives in @lingxiao-office/sdk (packages/sdk/src/web-server/GitService.ts).
 * web-api keeps this shim so local sibling imports (./GitService.js) stay valid.
 */
export { GitService, type Checkpoint, type FileDiff } from '@lingxiao-office/sdk/web-server/GitService.js';
