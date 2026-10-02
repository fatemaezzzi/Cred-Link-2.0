import { Router } from 'express';
import { trustController } from '../controllers/trust.controller.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = Router();

// Protect verification endpoint with JWT authentication middleware
router.use(authenticateUser);

router.post('/verify-credential', (req, res, next) => trustController.verifyCredentialComprehensive(req, res, next));

export default router;
