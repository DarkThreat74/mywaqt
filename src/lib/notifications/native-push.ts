import 'server-only';
import { createSign } from 'node:crypto';
import { connect as http2Connect, type ClientHttp2Session } from 'node:http2';
import { env } from '@/lib/env';

/**
 * Native push delivery — APNs (iOS) and FCM (Android) — with zero dependencies.
 *
 * APNs: Node's built-in http2 module talks HTTP/2 to api.push.apple.com.
 *   Auth is a JWT signed with ES256 (Apple p8 key), cached ~50 min.
 * FCM: fetch() calls the FCM HTTP v1 API. Auth is an OAuth2 access token
 *   minted by signing a JWT with the service account private key and
 *   exchanging it at oauth2.googleapis.com/token. Token cached ~50 min.
 *
 * If credentials are not configured, each platform is a silent no-op
 * so a single-platform dev setup still delivers to the other.
 */

export interface NativePushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  tag?: string;
}

export interface SendResult {
  delivered: boolean;
  expired: boolean;
}

// ── APNs (iOS) ──

function apnsConfigured(): boolean {
  return !!(env.apnsKeyId && env.apnsTeamId && env.apnsPrivateKey && env.apnsBundleId);
}

function apnsHost(): string {
  return env.apnsProduction
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

let apnsSession: ClientHttp2Session | null = null;
let apnsToken: { jwt: string; mintedAt: number } | null = null;
const APNS_TOKEN_TTL_MS = 50 * 60 * 1000;

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mintApnsJwt(): string {
  const now = Date.now();
  if (apnsToken && now - apnsToken.mintedAt < APNS_TOKEN_TTL_MS) return apnsToken.jwt;

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: env.apnsKeyId, typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: env.apnsTeamId, iat: Math.floor(now / 1000) }));
  const signingInput = `${header}.${claims}`;

  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  // Apple wants IEEE P1363 format (raw r||s, 64 bytes), not DER.
  const sig = signer.sign({ key: env.apnsPrivateKey, dsaEncoding: 'ieee-p1363' });
  const jwt = `${signingInput}.${base64url(sig)}`;
  apnsToken = { jwt, mintedAt: now };
  return jwt;
}

function getApnsSession(): ClientHttp2Session {
  if (apnsSession && !apnsSession.closed && !apnsSession.destroyed) return apnsSession;
  const s = http2Connect(apnsHost());
  s.on('error', () => { if (apnsSession === s) apnsSession = null; });
  s.on('close', () => { if (apnsSession === s) apnsSession = null; });
  s.on('goaway', () => { if (apnsSession === s) apnsSession = null; });
  apnsSession = s;
  return s;
}

// APNs returns 410 for bad device tokens
const APNS_DEAD_REASONS = new Set([
  'BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic',
  'ExpiredProviderToken',
]);

async function sendApns(token: string, payload: NativePushPayload): Promise<SendResult> {
  if (!apnsConfigured()) return { delivered: false, expired: false };

  const jwt = mintApnsJwt();
  const session = getApnsSession();

  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    sound: 'default',
    'mutable-content': 1,
  };
  if (payload.tag) aps['thread-id'] = payload.tag;

  const body = Buffer.from(JSON.stringify({ aps, ...payload.data }));

  return new Promise<SendResult>((resolve) => {
    let req;
    try {
      req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': env.apnsBundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': body.length,
      });
    } catch {
      resolve({ delivered: false, expired: false });
      return;
    }

    let status = 0;
    let respBody = '';

    req.on('response', (headers) => {
      const s = headers[':status'];
      status = typeof s === 'number' ? s : Number.parseInt(String(s ?? 0), 10) || 0;
    });
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { respBody += chunk; });
    req.on('end', () => {
      if (status >= 200 && status < 300) {
        resolve({ delivered: true, expired: false });
        return;
      }
      let reason: string | undefined;
      try { reason = (JSON.parse(respBody || '{}') as { reason?: string }).reason; } catch { /* ignore */ }
      const expired = status === 410 || (reason !== undefined && APNS_DEAD_REASONS.has(reason));
      resolve({ delivered: false, expired });
    });
    req.on('error', () => resolve({ delivered: false, expired: false }));
    req.write(body);
    req.end();
  });
}

// ── FCM (Android) ──

function fcmConfigured(): boolean {
  return !!(env.fcmProjectId && env.fcmClientEmail && env.fcmPrivateKey);
}

let fcmToken: { token: string; expiresAt: number } | null = null;
const FCM_TOKEN_TTL_MS = 50 * 60 * 1000;

async function mintFcmAccessToken(): Promise<string> {
  const now = Date.now();
  if (fcmToken && now < fcmToken.expiresAt) return fcmToken.token;

  // Sign a JWT with the service account private key
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: env.fcmClientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
  }));
  const signingInput = `${header}.${claims}`;

  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(env.fcmPrivateKey);
  const jwt = `${signingInput}.${base64url(sig)}`;

  // Exchange the JWT for an OAuth2 access token
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    throw new Error(`FCM token exchange failed: ${resp.status}`);
  }

  const data = await resp.json() as { access_token: string };
  fcmToken = { token: data.access_token, expiresAt: now + FCM_TOKEN_TTL_MS };
  return fcmToken.token;
}

async function sendFcm(token: string, payload: NativePushPayload): Promise<SendResult> {
  if (!fcmConfigured()) return { delivered: false, expired: false };

  const accessToken = await mintFcmAccessToken();
  const message: Record<string, unknown> = {
    token,
    notification: { title: payload.title, body: payload.body },
    android: {
      priority: 'high',
      notification: { sound: 'default', ...(payload.tag ? { tag: payload.tag } : {}) },
    },
  };
  if (payload.data) message.data = payload.data;

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.fcmProjectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    },
  );

  if (resp.ok) return { delivered: true, expired: false };

  // FCM returns 404 for unregistered tokens
  if (resp.status === 404) return { delivered: false, expired: true };

  // 400 with UNREGISTERED in the body also means expired token
  if (resp.status === 400) {
    try {
      const err = await resp.json() as { error?: { details?: Array<{ errorCode?: string }> } };
      const unregistered = err.error?.details?.some(d => d.errorCode === 'UNREGISTERED');
      if (unregistered) return { delivered: false, expired: true };
    } catch { /* ignore parse failure */ }
  }

  return { delivered: false, expired: false };
}

// ── Unified entry point ──

export async function sendNativePush(
  platform: 'ios' | 'android',
  token: string,
  payload: NativePushPayload,
): Promise<SendResult> {
  if (platform === 'ios') return sendApns(token, payload);
  if (platform === 'android') return sendFcm(token, payload);
  return { delivered: false, expired: false };
}
