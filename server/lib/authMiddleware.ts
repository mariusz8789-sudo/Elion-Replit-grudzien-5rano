import type { Request, Response, NextFunction } from "express";
import type { User } from "@shared/schema";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && (req.user as User).role === "admin") {
    return next();
  }
  res.status((req.user as User | undefined) ? 403 : 401).json({ message: (req.user as User | undefined) ? "Admin access required" : "Unauthorized" });
};
