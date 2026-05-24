import express from "express";
import { sendMail } from "../../config/gmail.js";

const router = express.Router();

router.post("/send", async (req, res) => {
    try {
        const {
            email,
            subject,
            message,
        } = req.body;

        await sendMail(
            email,
            subject,
            `<h3>${message}</h3>`
        );

        res.json({
            success: true,
        });
    } catch (err) {
        res.status(500).json({
            error: err.message,
        });
    }
});

export default router;