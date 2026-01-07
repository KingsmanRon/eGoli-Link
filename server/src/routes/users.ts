import { Router } from 'express';
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  resetPassword,
  getTechnicians,
} from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get technicians for job assignment (Admin/Supervisor)
router.get('/technicians', authorize('ADMIN', 'SUPERVISOR'), getTechnicians);

// Admin-only routes
router.get('/', authorize('ADMIN'), listUsers);
router.post('/', authorize('ADMIN'), createUser);
router.get('/:id', authorize('ADMIN'), getUserById);
router.patch('/:id', authorize('ADMIN'), updateUser);
router.post('/:id/reset-password', authorize('ADMIN'), resetPassword);

export default router;
