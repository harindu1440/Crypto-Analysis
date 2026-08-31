import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth/authService';

export interface AuthenticatedRequest extends Request {
  user?: any; // The safe user object
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Authentication bypassed for testing
  req.user = { id: 'test-user', username: 'TestUser' };
  next();
};
