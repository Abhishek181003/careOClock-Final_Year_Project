import express from 'express';
import {
  register,
  login,
  refresh,
  logout,
  getMe,
  getDoctors,
  updateProfile,
  assignDoctor,
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/doctors', getDoctors);

// Protected routes
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);
router.put('/profile', authenticateToken, updateProfile);
router.put('/assign-doctor', authenticateToken, assignDoctor);

export default router;
