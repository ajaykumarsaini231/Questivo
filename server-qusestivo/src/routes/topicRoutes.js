import { Router } from "express";
import {
  getAllTopics,
  getTopicsForExam,
  createTopicForExam,
  updateTopic,
  deactivateTopic,
} from "../controllers/topicController.js";
import { adminIdentifier } from "../middleware/adminIdentifier.js";

const router = Router();

/**
 * Reading the syllabus is public — the generate-test form fetches it before
 * anyone has signed in, and the exam landing pages are indexed.
 *
 * WRITING IT WAS ALSO PUBLIC, AND SHOULD NEVER HAVE BEEN.
 *
 * The three write routes below carried no middleware at all. Mounted at
 * /api/cate_topics in server.js, that made
 * `POST /api/cate_topics/exam-categories/<id>/topics` and
 * `PUT /api/cate_topics/topics/<id>` writable by anyone on the internet with
 * curl — no account, no cookie, no token. Combined with topicController's
 * `data: req.body` update, any visitor could rewrite any row of the syllabus
 * every exam in the catalogue is generated from.
 *
 * categoryRoutes.js right next door already guards its equivalents with
 * adminIdentifier; this file was simply missed.
 */
router.get("/topics", getAllTopics);
router.get("/exam-categories/:codeOrId/topics", getTopicsForExam);

router.post("/exam-categories/:examId/topics", adminIdentifier, createTopicForExam);
router.put("/topics/:id", adminIdentifier, updateTopic);
router.patch("/topics/:id/deactivate", adminIdentifier, deactivateTopic);

export default router;
