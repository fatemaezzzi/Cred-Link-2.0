import { Router } from 'express';
import { trustController } from '../controllers/trust.controller.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = Router();

// Protect all endpoints with JWT authentication middleware
router.use(authenticateUser);

router.get('/', (req, res, next) => trustController.list(req, res, next));
router.post('/register', (req, res, next) => trustController.registerIssuer(req, res, next));
router.get('/:orgId', (req, res, next) => trustController.getByOrgId(req, res, next));
router.patch('/:id/status', (req, res, next) => trustController.updateStatus(req, res, next));

export default router;
