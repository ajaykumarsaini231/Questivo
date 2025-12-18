import express from "express";
import { 
    getMyProfile, 
    updateProfile // ✅ Import updated name
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", protect, getMyProfile);
router.put("/profile", protect, updateProfile); // ✅ Changed from updateMedium to updateProfile

export default router;