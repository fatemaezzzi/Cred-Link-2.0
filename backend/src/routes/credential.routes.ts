import { Router } from 'express';
import { credentialController } from '../controllers/credential.controller';
import { authenticateUser } from '../middleware/authMiddleware';

const router = Router();

// Require authenticated JWT user context for all credential endpoints
router.use(authenticateUser);

router.post('/', (req, res, next) => credentialController.create(req, res, next));
router.get('/', (req, res, next) => credentialController.list(req, res, next));
router.post('/verify', (req, res, next) => credentialController.verify(req, res, next));
router.get('/:id', (req, res, next) => credentialController.getById(req, res, next));
router.post('/:id/revoke', (req, res, next) => credentialController.revoke(req, res, next));

export default router;
