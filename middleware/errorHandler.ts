import { type Request, type Response, type NextFunction } from "express";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
};
