import { Router } from 'express';
import { organizationController } from '../controllers/organization.controller.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = Router();

// Protect endpoints with JWT authentication middleware
router.use(authenticateUser);

router.get('/', (req, res, next) => organizationController.list(req, res, next));
router.get('/:id', (req, res, next) => organizationController.getById(req, res, next));
router.post('/', (req, res, next) => organizationController.create(req, res, next));
router.patch('/:id/status', (req, res, next) => organizationController.updateStatus(req, res, next));

export default router;
