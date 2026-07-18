import { type Request, type Response, type NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL(
    `${process.env.CLIENT_URL || "http://localhost:3000"}/api/auth/jwks`,
  ),
);

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  name?: string;
  [key: string]: unknown;
}

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized: No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ message: "Unauthorized: Invalid token format" });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};
