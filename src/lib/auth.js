// Microsoft 365 sign-in. Tokens are only needed when uploading; everything else works signed out.

import { PublicClientApplication, InteractionRequiredAuthError, BrowserAuthError } from '@azure/msal-browser';
import { AUTH } from '../config.js';

let pca = null;
let ready = null;

function redirectUri() {
  return window.location.origin;
}

export function init() {
  if (!ready) {
    pca = new PublicClientApplication({
      auth: {
        clientId: AUTH.clientId,
        authority: 'https://login.microsoftonline.com/' + AUTH.tenantId,
        redirectUri: redirectUri(),
        postLogoutRedirectUri: redirectUri(),
      },
      cache: { cacheLocation: 'localStorage' },
    });
    ready = (async () => {
      await pca.initialize();
      try {
        const res = await pca.handleRedirectPromise();
        if (res?.account) pca.setActiveAccount(res.account);
      } catch (e) {
        console.warn('Sign-in redirect failed', e);
      }
      if (!pca.getActiveAccount()) {
        const all = pca.getAllAccounts();
        if (all.length) pca.setActiveAccount(all[0]);
      }
    })();
  }
  return ready;
}

export function account() {
  return pca?.getActiveAccount() || null;
}

export async function signIn() {
  await init();
  await pca.loginRedirect({ scopes: AUTH.scopes, prompt: 'select_account' });
}

export async function signOut() {
  await init();
  const acc = account();
  await pca.logoutRedirect({ account: acc || undefined });
}

export class SignInNeeded extends Error {
  constructor() {
    super('Sign in to upload');
    this.name = 'SignInNeeded';
  }
}

// Returns an access token, or throws SignInNeeded when the technician has to sign in again
// (for example after more than 24 hours offline).
export async function token() {
  await init();
  const acc = account();
  if (!acc) throw new SignInNeeded();
  try {
    const res = await pca.acquireTokenSilent({ scopes: AUTH.scopes, account: acc });
    return res.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) throw new SignInNeeded();
    const code = String(e?.errorCode || '');
    if (/network|post_request_failed|get_request_failed|timed_out/i.test(code)) {
      const off = new Error('No connection to Microsoft');
      off.name = 'Offline';
      throw off;
    }
    if (e instanceof BrowserAuthError) throw new SignInNeeded();
    throw e;
  }
}

export async function renewSignIn() {
  await init();
  await pca.acquireTokenRedirect({ scopes: AUTH.scopes, account: account() || undefined });
}
