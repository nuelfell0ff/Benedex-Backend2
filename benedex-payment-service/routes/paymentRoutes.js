import express from "express";
import {
  initializePayment,
  verifyPayment,
  handlePaystackWebhook,
  getAllPaymentsForAdmin,
  getPaymentTelemetry,
  getPaymentTickets,
  resolvePaymentTicket,
  logAuditActivity
} from "../controllers/paymentController.js";
import { protect, admin } from "../middleware/authMiddleware.js";
import { paymentLimiter, webhookLimiter } from "../middleware/paymentLimiter.js";

const router = express.Router();

// Public Webhook (Paystack)
router.post("/webhook", webhookLimiter, handlePaystackWebhook);

// Internal Inter-Service Telemetry & Audit Routes
router.get("/internal/telemetry", protect, getPaymentTelemetry);
router.post("/audit-log", protect, logAuditActivity);

// Protected Payment Operations
router.post("/initialize", protect, paymentLimiter, initializePayment);
router.get("/verify/:reference", protect, paymentLimiter, verifyPayment);

// Admin Portal Operations
router.get("/all", protect, admin, getAllPaymentsForAdmin);
router.get("/tickets", protect, admin, getPaymentTickets);
router.put("/tickets/:ticketId", protect, admin, resolvePaymentTicket);

export default router;