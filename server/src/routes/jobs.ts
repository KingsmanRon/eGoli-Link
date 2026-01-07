import { Router } from 'express';
import multer from 'multer';
import {
  listJobs,
  getMyJobs,
  getJob,
  createNewJob,
  updateJob,
  updateStatus,
  assignToTechnician,
  uploadPhoto,
  deleteJob,
  getStatistics,
} from '../controllers/jobController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Configure multer for photo uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// All routes require authentication
router.use(authenticate);

// Job listing and statistics
router.get('/', listJobs);
router.get('/my', getMyJobs);
router.get('/stats', getStatistics);

// Individual job operations
router.get('/:id', getJob);
router.post('/', authorize('ADMIN', 'SUPERVISOR'), createNewJob);
router.patch('/:id', updateJob);
router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), deleteJob);

// Status updates
router.patch('/:id/status', updateStatus);
router.post('/:id/assign', authorize('ADMIN', 'SUPERVISOR'), assignToTechnician);

// Photo uploads
router.post('/:id/photos', upload.single('photo'), uploadPhoto);

export default router;
