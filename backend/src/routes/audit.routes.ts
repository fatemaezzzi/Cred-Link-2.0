import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';
import { authenticateUser } from '../middleware/authMiddleware';

const router = Router();

// Protect audit log endpoints with JWT authentication middleware
router.use(authenticateUser);

router.get('/', (req, res, next) => auditController.list(req, res, next));

export default router;
