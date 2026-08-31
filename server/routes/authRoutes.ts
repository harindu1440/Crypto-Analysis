import express from 'express';
import { AuthService } from '../services/auth/authService';
import { requireAuth } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/register', (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const user = AuthService.register(email, password, displayName);
    
    // Automatically login after register
    const { token, user: safeUser } = AuthService.login(email, password);
    
    res.cookie('sessionToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({ user: safeUser });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const { user, token } = AuthService.login(email, password);
    
    res.cookie('sessionToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({ user });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.split(' ')[1];
    if (token) AuthService.logout(token);
    
    res.clearCookie('sessionToken');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', requireAuth, (req: any, res) => {
  res.json({ user: req.user });
});

export default router;
