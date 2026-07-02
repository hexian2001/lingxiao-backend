/**
 * Re-export from canonical location.
 * The implementation now lives in src/core/git/RealGitService.ts.
 */
export {
  RealGitService,
  parseRemoteUrl,
  type FileStatus,
  type GitBranch,
  type GitCommit,
  type GitInitResult,
  type GitRemote,
  type GitStatus,
  type PushOptions,
} from '@lingxiao-office/sdk/core/git/RealGitService.js';
