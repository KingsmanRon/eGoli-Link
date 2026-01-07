import { Router } from 'express';
import {
  login,
  register,
  refresh,
  logout,
  getProfile,
  updatePassword,
} from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Public routes
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Admin only - create new users
router.post('/register', authenticate, authorize('ADMIN'), register);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.put('/password', authenticate, updatePassword);

export default router;
