import { type Request, type Response, type NextFunction } from "express";

let JWKS: Awaited<ReturnType<typeof createJWKS>> | null = null;

async function createJWKS() {
  const { createRemoteJWKSet } = await import("jose");
  return createRemoteJWKSet(
    new URL(
      `${process.env.CLIENT_URL || "http://localhost:3000"}/api/auth/jwks`,
    ),
  );
}

async function getJWKS() {
  if (!JWKS) JWKS = await createJWKS();
  return JWKS;
}

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
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, await getJWKS());
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};
