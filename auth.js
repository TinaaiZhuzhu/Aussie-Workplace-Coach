import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

let client;
let currentSession;
let currentConfig;
let recoveryMode = false;

export async function initialiseAuth() {
  const configResponse = await fetch('/api/config');
  if (!configResponse.ok) throw new Error('Authentication is not configured on the server.');
  const config = await configResponse.json();
  currentConfig = config;
  client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    // The local app may be opened in the Codex browser while email opens in a
    // normal browser. Implicit token-fragment handling avoids requiring the
    // PKCE verifier to exist in both browser contexts.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' },
  });
  client.auth.onAuthStateChange((_event, session) => { currentSession = session; });
  const callbackUrl = new URL(window.location.href);
  const callbackHash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
  recoveryMode = callbackHash.get('type') === 'recovery';
  const callbackError = callbackUrl.searchParams.get('error_description') || callbackHash.get('error_description');
  if (callbackError) {
    history.replaceState({}, document.title, window.location.pathname);
    throw new Error(`Supabase rejected the sign-in link: ${callbackError.replace(/\+/g, ' ')}`);
  }
  const callbackCode = callbackUrl.searchParams.get('code');
  if (callbackCode) {
    const { error } = await client.auth.exchangeCodeForSession(callbackCode);
    if (error) throw new Error(`The sign-in link could not be completed: ${error.message}`);
    history.replaceState({}, document.title, window.location.pathname);
  } else if (callbackHash.get('access_token') && callbackHash.get('refresh_token')) {
    const { error } = await client.auth.setSession({ access_token: callbackHash.get('access_token'), refresh_token: callbackHash.get('refresh_token') });
    if (error) throw new Error(`The sign-in link could not be completed: ${error.message}`);
    history.replaceState({}, document.title, window.location.pathname);
  }
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  currentSession = data.session;
  return currentSession;
}

export function supabaseClient() { return client; }
export function authSession() { return currentSession; }
export function authConfig() { return currentConfig; }
export function isPasswordRecovery() { return recoveryMode; }
export function authHeaders(extra = {}) {
  return currentSession ? { ...extra, Authorization: `Bearer ${currentSession.access_token}` } : extra;
}

export async function signInWithPassword(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentSession = data.session;
  return data.session;
}

export async function signUpWithPassword(email, password) {
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } });
  if (error) throw error;
  currentSession = data.session;
  return data;
}

export async function sendPasswordReset(email) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
  recoveryMode = false;
}

export async function verifyAccess() {
  const response = await fetch('/api/auth/check', { headers: authHeaders() });
  if (!response.ok) throw new Error(response.status === 403 ? 'This email is not on the private access list.' : 'Please sign in again.');
  return response.json();
}

export async function signOut() {
  await client.auth.signOut();
  currentSession = null;
  location.reload();
}
