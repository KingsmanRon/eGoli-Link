import { Router } from 'express';
import multer from 'multer';
import {
  uploadPDF,
  getPDFStatus,
  getPDFLocations,
  listPDFs,
  createJobsFromPDF,
  retryGeocoding,
} from '../controllers/pdfController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Configure multer for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for PDFs
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// All routes require authentication
router.use(authenticate);

// PDF operations
router.get('/', listPDFs);
router.post('/upload', authorize('ADMIN', 'SUPERVISOR'), upload.single('pdf'), uploadPDF);
router.get('/:id/status', getPDFStatus);
router.get('/:id/locations', getPDFLocations);
router.post('/:id/create-jobs', authorize('ADMIN', 'SUPERVISOR'), createJobsFromPDF);

// Geocoding operations
router.post('/geocode/retry', authorize('ADMIN', 'SUPERVISOR'), retryGeocoding);

export default router;
