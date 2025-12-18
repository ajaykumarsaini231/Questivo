import express from 'express';
import * as AdminController from '../controllers/adminController.js';
// Import your auth middleware here
// import { protect, adminOnly } from '../middleware/authMiddleware.js'; 
import { adminIdentifier } from '../middleware/adminIdentifier.js'; // <--- Import here

const router = express.Router();

router.use(adminIdentifier)
// Apply middleware to all routes below
// router.use(protect);
// router.use(adminOnly);

// --- Stats ---
router.get('/stats', AdminController.getAdminStats);
router.get('/verify', AdminController.verifyAdminAccess);
// --- Users ---
router.get('/users/:id', AdminController.getUserDetails);
router.post('/users', AdminController.createUser);
router.get('/users', AdminController.getAllUsers);
router.put('/users/:id', AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);

// --- Categories ---
router.post('/categories', AdminController.createCategory);
router.get('/categories', AdminController.getAllCategories);
router.put('/categories/:id', AdminController.updateCategory);
router.delete('/categories/:id', AdminController.deleteCategory);

// --- Topics ---
router.post('/topics', AdminController.createTopic);
// Note: This route expects param in URL, e.g., /topics/category/123
router.get('/topics/category/:categoryId', AdminController.getTopicsByCategory); 
router.put('/topics/:id', AdminController.updateTopic);
router.delete('/topics/:id', AdminController.deleteTopic);

// --- Sessions ---
router.get('/sessions', AdminController.getAllSessions); // List
router.get('/sessions/:id', AdminController.getSessionDetails); // Detail
router.delete('/sessions/:id', AdminController.deleteSession);

// --- Questions ---
router.post('/questions', AdminController.createQuestion);
router.put('/questions/:id', AdminController.updateQuestion);
router.delete('/questions/:id', AdminController.deleteQuestion);

// --- Pending Users ---
router.get('/pending-users', AdminController.getPendingUsers);
router.delete('/pending-users/:email', AdminController.deletePendingUser);

export default router;