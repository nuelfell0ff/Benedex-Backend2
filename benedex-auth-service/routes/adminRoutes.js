import express from "express";
import {
  getAdminAnalytics,
  getPaymentTickets,
  resolvePaymentTicket,
} from "../controllers/adminController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { cacheRoute } from "../middleware/cacheMiddleware.js";

const router = express.Router();

// Admin Analytics (Cached for 30s for lightning speed)
router.get(
  "/analytics",
  protect,
  authorize("admin"),
  cacheRoute(30),
  getAdminAnalytics
);

// Fetch Support Tickets
router.get(
  "/tickets",
  protect,
  authorize("admin"),
  getPaymentTickets
);

// Process Support Ticket
router.put(
  "/tickets/:ticketId",
  protect,
  authorize("admin"),
  resolvePaymentTicket
);

export default router;