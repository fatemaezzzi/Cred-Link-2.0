import { Router } from 'express';
import { consentController } from '../controllers/consent.controller';
import { authenticateUser } from '../middleware/authMiddleware';

const router = Router();

// Protect all consent endpoints with JWT authentication middleware
router.use(authenticateUser);

router.post('/request', (req, res, next) => consentController.request(req, res, next));
router.post('/', (req, res, next) => consentController.grant(req, res, next));
router.get('/', (req, res, next) => consentController.list(req, res, next));
router.post('/share-access', (req, res, next) => consentController.accessSharedCredential(req, res, next));
router.get('/:id', (req, res, next) => consentController.getById(req, res, next));
router.post('/:id/respond', (req, res, next) => consentController.respond(req, res, next));
router.post('/:id/revoke', (req, res, next) => consentController.revoke(req, res, next));

export default router;
