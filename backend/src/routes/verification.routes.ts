import { Router } from 'express';
import { trustController } from '../controllers/trust.controller';
import { authenticateUser } from '../middleware/authMiddleware';

const router = Router();

// Protect verification endpoint with JWT authentication middleware
router.use(authenticateUser);

router.post('/verify-credential', (req, res, next) => trustController.verifyCredentialComprehensive(req, res, next));

export default router;
