import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth/authService';

export interface AuthenticatedRequest extends Request {
  user?: any; // The safe user object
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.sessionToken || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No session token provided' });
  }

  const user = AuthService.verifySession(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  const { passwordHash, salt, ...safeUser } = user;
  req.user = safeUser;
  next();
};
