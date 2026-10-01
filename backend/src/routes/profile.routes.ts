import { Router } from 'express';
import { profileController } from '../controllers/profile.controller';
import { authenticateUser } from '../middleware/authMiddleware';

const router = Router();

// Protect all profile endpoints with verified JWT middleware
router.use(authenticateUser);

router.get('/me', (req, res, next) => profileController.getMe(req, res, next));
router.patch('/me', (req, res, next) => profileController.updateMe(req, res, next));
router.get('/citizens', (req, res, next) => profileController.listCitizens(req, res, next));

export default router;
