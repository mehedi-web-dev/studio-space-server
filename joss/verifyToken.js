import { createRemoteJWKSet, jwtVerify } from "jose";

const authBaseURL = process.env.AUTH_BASE_URL || "http://localhost:3000";

const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", authBaseURL));

const verifyToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token is required",
      });
    }

    const token = authorization.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authBaseURL,
      audience: authBaseURL,
    });

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired token",
    });
  }
};

export default verifyToken;
