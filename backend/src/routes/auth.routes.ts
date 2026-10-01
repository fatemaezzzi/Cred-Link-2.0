import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateUser } from '../middleware/authMiddleware';

const router = Router();

// Public auth endpoints
router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/login', (req, res, next) => authController.login(req, res, next));

// Protected auth endpoints requiring valid JWT token
router.post('/logout', authenticateUser, (req, res, next) => authController.logout(req, res, next));
router.get('/me', authenticateUser, (req, res, next) => authController.getMe(req, res, next));

export default router;
