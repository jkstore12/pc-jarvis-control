import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { ServerEnv } from "./env.js";

export interface AuthUser {
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function createAuth(env: Pick<ServerEnv, "ADMIN_EMAIL" | "ADMIN_PASSWORD_HASH" | "JWT_SECRET">) {
  async function login(email: string, password: string): Promise<string | null> {
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail !== env.ADMIN_EMAIL.toLowerCase()) {
      return null;
    }

    const matches = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
    if (!matches) {
      return null;
    }

    return jwt.sign({ email: env.ADMIN_EMAIL }, env.JWT_SECRET, {
      subject: env.ADMIN_EMAIL,
      expiresIn: "8h"
    });
  }

  function verify(token: string): AuthUser | null {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      if (typeof decoded === "string" || typeof decoded.email !== "string") {
        return null;
      }

      return { email: decoded.email };
    } catch {
      return null;
    }
  }

  function middleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
      res.status(401).json({ error: "Missing bearer token." });
      return;
    }

    const user = verify(token);
    if (!user) {
      res.status(401).json({ error: "Invalid or expired token." });
      return;
    }

    req.user = user;
    next();
  }

  return { login, verify, middleware };
}
