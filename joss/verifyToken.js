import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

const authBaseURL = process.env.AUTH_BASE_URL || "http://localhost:3000";

// ========================================
// BETTER AUTH JWT CONFIGURATION (defaults from the Better Auth jwt plugin)
// ========================================
//
// Better Auth (with the JWT plugin) exposes two JWT "flavors":
//
// 1. Session-cache JWT (`session_data` cookie, when the frontend uses
//    `session.cookieCache: { strategy: "jwt" }` + `jwt({ sessionCookieCache: true })`):
//    - header:   typ = "better-auth.session-cache+jwt"
//    - payload:  iss = baseURL, aud = "better-auth:session-cache" (constant),
//                sub = user.id, sid = session token, user = { id, email, name, ... }
//    (source: better-auth packages/better-auth/src/plugins/jwt/cookie-cache.ts)
//
// 2. Token JWT (`/api/auth/token` endpoint / "set-auth-jwt" response header):
//    - payload:  iss = jwt.issuer ?? baseURL, aud = jwt.audience ?? baseURL,
//                sub = user.id, email / name as top-level claims
//    (source: better-auth packages/better-auth/src/plugins/jwt/sign.ts)
//
// Both flavors are signed with the key published at /api/auth/jwks.

const SESSION_CACHE_JWT_TYPE = "better-auth.session-cache+jwt";
const SESSION_CACHE_JWT_AUDIENCE = "better-auth:session-cache";

const JWT_ISSUER = process.env.JWT_ISSUER || authBaseURL;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || authBaseURL;

// Better Auth JWKS endpoint (public keys of the auth server).
const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", authBaseURL));

// Matches Better Auth cookie names: "<prefix>.session_data", where the
// default prefix is "better-auth" (custom prefixes / "__Secure-" supported).
const looksLikeJwt = (value) =>
  typeof value === "string" &&
  value.split(".").length === 3 &&
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

const collectTokenCandidates = (req) => {
  const candidates = [];
  const push = (name, value) => {
    if (looksLikeJwt(value)) candidates.push({ name, value });
  };

  // Cookie candidates prefer the actual JWT session cookie ending in
  // ".session_data". ".session_token" is normally an opaque Better Auth
  // session token (token.hmac), so it only qualifies if it looks like a JWT.
  // Forged values from any other cookie are harmless: they still have to
  // pass cryptographic verification below.
  for (const [name, value] of Object.entries(req.cookies || {})) {
    if (name.endsWith(".session_data") || name === "session_data") {
      push(name, value);
    }
  }
  for (const [name, value] of Object.entries(req.cookies || {})) {
    if (name.endsWith(".session_token") || name === "session_token") {
      push(name, value);
    }
  }

  // Optional: allow `Authorization: Bearer <jwt>` (useful for API tests).
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    push("authorization", authHeader.slice(7).trim());
  }

  return candidates;
};

const verifyToken = async (req, res, next) => {
  const candidates = collectTokenCandidates(req);

  if (candidates.length === 0) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Authentication is required",
    });
  }

  for (const { name, value: token } of candidates) {
    let header = null;

    try {
      header = decodeProtectedHeader(token);
    } catch {
      console.error(`JWT verification failed (cookie "${name}"): malformed token`);
    }

    if (!header) {
      continue; // not a parseable JWS -> try next candidate
    }

    try {
      // Issuer / audience depend on the exact Better Auth JWT flavor.
      const verifyOptions =
        header?.typ === SESSION_CACHE_JWT_TYPE
          ? { issuer: JWT_ISSUER, audience: SESSION_CACHE_JWT_AUDIENCE }
          : { issuer: JWT_ISSUER, audience: JWT_AUDIENCE };

      // jwtVerify validates the signature (JWKS), exp, nbf, iss and aud.
      // Missing or expired tokens throw and are rejected below.
      const { payload } = await jwtVerify(token, JWKS, {
        ...verifyOptions,
        clockTolerance: 15,
      });

      const nestedUser =
        payload.user && typeof payload.user === "object" ? payload.user : {};

      const userId = payload.sub ?? nestedUser.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Invalid user session",
        });
      }

      // Only verified claims are exposed downstream.
      req.user = {
        id: String(userId),
        email: nestedUser.email ?? payload.email ?? null,
        name: nestedUser.name ?? payload.name ?? null,
      };

      return next();
    } catch (error) {
      // Try the next candidate; handled after the loop.
      console.error(
        `JWT verification failed (cookie "${name}"): ${error.name}: ${error.message}`,
      );
    }
  }

  return res.status(401).json({
    success: false,
    message: "Unauthorized: Invalid or expired token",
  });
};

export default verifyToken;
