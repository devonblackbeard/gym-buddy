import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { User } from "../../shared/types";
import { query, sql } from "./db";
import { HttpError, json, pgCode, readBody } from "./http";

// Email + password accounts with server-side sessions.
//
// Passwords are hashed with scrypt (random salt per user). Signing in creates a session row and an
// HttpOnly cookie holding a random token; the database only stores the token's SHA-256, so a leaked
// database can't be used to sign in. Sessions slide: using the app keeps you signed in.

const COOKIE = "gb_session";
const SESSION_DAYS = 180;
const RENEW_WITHIN_DAYS = 150; // extend a session once it has less than this left
const MAX_FAILURES = 10; // failed sign-ins per email per 15 minutes
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export interface Auth {
  userId: number;
  /** Set when the session was renewed; the response should carry this Set-Cookie. */
  renewCookie?: string;
}

// ---- passwords ---------------------------------------------------------------

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scryptAsync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(key, expected);
}

// Compared against when the email doesn't exist, so response time doesn't reveal which emails have accounts.
let dummyHash: Promise<string> | null = null;

// ---- validation ----------------------------------------------------------------

function parseEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim() : "";
  if (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  throw new HttpError(400, "Enter a valid email address");
}

function parsePassword(value: unknown, forSignup: boolean): string {
  const password = typeof value === "string" ? value : "";
  if (!forSignup) {
    if (password.length === 0) throw new HttpError(400, "Enter your password");
    return password;
  }
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  if (password.length > 200) throw new HttpError(400, "Password must be at most 200 characters");
  return password;
}

// ---- sessions & cookies ----------------------------------------------------------

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

function cookieHeader(req: Request, value: string, maxAgeSeconds: number) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function readToken(req: Request): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

async function startSession(req: Request, userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql()`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${sha256(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  return cookieHeader(req, token, SESSION_DAYS * 86400);
}

const withCookie = (response: Response, cookie: string) => {
  response.headers.append("set-cookie", cookie);
  return response;
};

/** The signed-in user, or null. Renews the session when it's getting old. */
export async function authenticate(req: Request): Promise<Auth | null> {
  const token = readToken(req);
  if (!token) return null;
  const [session] = await query<{ userId: number; renew: boolean }>(
    `SELECT user_id AS "userId", expires_at < now() + make_interval(days => $2) AS renew
       FROM sessions WHERE token_hash = $1 AND expires_at > now()`,
    [sha256(token), RENEW_WITHIN_DAYS],
  );
  if (!session) return null;
  if (!session.renew) return { userId: session.userId };
  await query(`UPDATE sessions SET expires_at = now() + make_interval(days => $2) WHERE token_hash = $1`, [
    sha256(token),
    SESSION_DAYS,
  ]);
  return { userId: session.userId, renewCookie: cookieHeader(req, token, SESSION_DAYS * 86400) };
}

export async function requireUser(req: Request): Promise<Auth> {
  const auth = await authenticate(req);
  if (!auth) throw new HttpError(401, "Please sign in to continue");
  return auth;
}

// ---- handlers ------------------------------------------------------------------

async function loadUser(id: number): Promise<User> {
  const [user] = await query<User>(`SELECT id, email FROM users WHERE id = $1`, [id]);
  return user;
}

export async function me(req: Request) {
  const auth = await requireUser(req);
  const response = json({ user: await loadUser(auth.userId) });
  return auth.renewCookie ? withCookie(response, auth.renewCookie) : response;
}

export async function signUp(req: Request) {
  const body = await readBody(req);
  const email = parseEmail(body.email);
  const password = parsePassword(body.password, true);
  const passwordHash = await hashPassword(password);

  let user: User;
  try {
    [user] = await query<User>(`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`, [
      email,
      passwordHash,
    ]);
  } catch (error) {
    if (pgCode(error) === "23505") throw new HttpError(409, "An account with that email already exists. Sign in instead.");
    throw error;
  }

  // Data logged before accounts existed belongs to whoever creates the first account.
  const [{ count }] = await query<{ count: number }>(`SELECT count(*)::int AS count FROM users`);
  if (count === 1) {
    await query(`UPDATE exercises SET user_id = $1 WHERE user_id IS NULL`, [user.id]);
    await query(`UPDATE workouts SET user_id = $1 WHERE user_id IS NULL`, [user.id]);
    await query(`UPDATE routines SET user_id = $1 WHERE user_id IS NULL`, [user.id]);
  }

  return withCookie(json({ user }, 201), await startSession(req, user.id));
}

export async function signIn(req: Request) {
  const body = await readBody(req);
  const email = parseEmail(body.email);
  const password = parsePassword(body.password, false);

  const [{ failures }] = await query<{ failures: number }>(
    `SELECT count(*)::int AS failures FROM login_failures
      WHERE lower(email) = lower($1) AND created_at > now() - interval '15 minutes'`,
    [email],
  );
  if (failures >= MAX_FAILURES) {
    throw new HttpError(429, "Too many sign-in attempts. Wait 15 minutes and try again.");
  }

  const [account] = await query<{ id: number; email: string; passwordHash: string }>(
    `SELECT id, email, password_hash AS "passwordHash" FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  const ok = await verifyPassword(password, account?.passwordHash ?? (await dummyHash));

  if (!account || !ok) {
    await query(`DELETE FROM login_failures WHERE created_at < now() - interval '1 day'`);
    await query(`INSERT INTO login_failures (email) VALUES ($1)`, [email]);
    throw new HttpError(401, "Wrong email or password");
  }

  await query(`DELETE FROM login_failures WHERE lower(email) = lower($1)`, [email]);
  const user: User = { id: account.id, email: account.email };
  return withCookie(json({ user }), await startSession(req, user.id));
}

export async function signOut(req: Request) {
  const token = readToken(req);
  if (token) await sql()`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  return withCookie(new Response(null, { status: 204 }), cookieHeader(req, "", 0));
}

export { withCookie };
