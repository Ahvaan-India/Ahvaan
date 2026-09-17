import express from "express";
import { processRequest } from "../controllers/requests.controller";

const router = express.Router();

router.post("/api", processRequest);

export default router;
