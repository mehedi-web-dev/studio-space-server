import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

// This must point to the Better Auth frontend server.
const authBaseURL = (
  process.env.AUTH_BASE_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const SESSION_CACHE_JWT_TYPE = "better-auth.session-cache+jwt";
const SESSION_CACHE_JWT_AUDIENCE = "better-auth:session-cache";

const JWT_ISSUER = process.env.JWT_ISSUER || authBaseURL;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || authBaseURL;

// Better Auth public JWKS endpoint.
const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", authBaseURL));

// Check whether a value has JWT structure.
const looksLikeJwt = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

// Session cookie names issued by Better Auth. With a https baseURL the cookies
// carry a "__Secure-" prefix, so match on suffixes instead of exact names.
const isSessionCookieBase = (name) =>
  name.endsWith(".session_data") || name === "session_data"
    ? "session_data"
    : name.endsWith(".session_token") || name === "session_token"
      ? "session_token"
      : null;

// Better Auth chunks oversized cookies ("<base>.0", "<base>.1", ...) when a
// single cookie would exceed the ~4KB browser limit. Split the chunk index
// off the name so chunked and unchunked cookies can be told apart.
const matchSessionCookie = (name) => {
  const chunk = /^(.+)\.(\d+)$/.exec(name);

  if (chunk && isSessionCookieBase(chunk[1]) && isSessionCookieBase(name) === null) {
    return { base: chunk[1], index: Number(chunk[2]) };
  }

  const base = isSessionCookieBase(name);

  return base ? { base, index: null } : null;
};

// Collect possible JWT tokens from cookies and Authorization header.
// Chunked cookies are reassembled in index order before verification.
const collectTokenCandidates = (req) => {
  const candidates = [];

  const push = (name, value) => {
    if (looksLikeJwt(value)) {
      candidates.push({ name, value });
    }
  };

  const chunks = new Map();

  for (const [name, value] of Object.entries(req.cookies || {})) {
    const match = matchSessionCookie(name);

    if (match === null) continue;

    if (match.index !== null) {
      const parts = chunks.get(match.base) ?? [];
      parts.push({ index: match.index, value });
      chunks.set(match.base, parts);
    } else {
      push(name, value);
    }
  }

  for (const [base, parts] of chunks) {
    parts.sort((a, b) => a.index - b.index);
    push(base, parts.map((part) => part.value).join(""));
  }

  // Bearer token support.
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
    try {
      const header = decodeProtectedHeader(token);

      // Session-cache JWT and regular JWT use different audiences.
      const verifyOptions =
        header.typ === SESSION_CACHE_JWT_TYPE
          ? {
              issuer: JWT_ISSUER,
              audience: SESSION_CACHE_JWT_AUDIENCE,
            }
          : {
              issuer: JWT_ISSUER,
              audience: JWT_AUDIENCE,
            };

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

      // Expose only verified user information.
      req.user = {
        id: String(userId),
        email: nestedUser.email ?? payload.email ?? null,
        name: nestedUser.name ?? payload.name ?? null,
      };

      return next();
    } catch (error) {
      console.error(
        `JWT verification failed (${name}):`,
        error.code || error.name,
        error.message,
      );
    }
  }

  return res.status(401).json({
    success: false,
    message: "Unauthorized: Invalid or expired token",
  });
};

export default verifyToken;
