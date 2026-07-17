// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Request } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id?: string;
        _id?: string;
        name?: string;
        email?: string;
        image?: string;
        role?: string;
      };
    }
  }
}

export {};
