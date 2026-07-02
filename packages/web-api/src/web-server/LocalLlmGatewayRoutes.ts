/**
 * Re-export from canonical location.
 * The implementation now lives in @lingxiao-office/sdk (packages/sdk/src/web-server/LocalLlmGatewayRoutes.ts).
 * web-api keeps this shim so local sibling imports (./LocalLlmGatewayRoutes.js) stay valid.
 */
export {
  registerLocalLlmGatewayRoutes,
  extractAttemptsFromError,
  type GatewayDeps,
} from '@lingxiao-office/sdk/web-server/LocalLlmGatewayRoutes.js';
