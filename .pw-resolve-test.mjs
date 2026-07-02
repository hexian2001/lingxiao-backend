import { checkBrowserHealth } from './packages/sdk/dist/core/BrowserProvider.js';
const h = await checkBrowserHealth({ launch: false });
console.log('playwrightCliExists:', h.playwrightCliExists);
console.log('playwrightVersion:', h.playwrightVersion);
console.log('installCommand:', h.installCommand);
console.log(h.playwrightCliExists && h.playwrightVersion ? 'RESOLVE_OK' : 'RESOLVE_FAIL');
