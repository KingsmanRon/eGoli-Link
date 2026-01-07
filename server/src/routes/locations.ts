import { Router } from 'express';
import {
  listLocations,
  getMapLocations,
  getUngeocoded,
  getLocation,
  updateCoordinates,
  createLocation,
  getStats,
  getTownships,
} from '../controllers/locationController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Location listing
router.get('/', listLocations);
router.get('/map', getMapLocations);
router.get('/ungeocode', getUngeocoded);
router.get('/stats', getStats);
router.get('/townships', getTownships);

// Individual location operations
router.get('/:id', getLocation);
router.patch('/:id', authorize('ADMIN', 'SUPERVISOR'), updateCoordinates);
router.post('/', authorize('ADMIN', 'SUPERVISOR'), createLocation);

export default router;
