import User from "../models/User.js";
import AiMessage from "../models/AiMessage.js";
import axios from "axios";

/**
 * Helper to normalize base URLs (removes trailing slashes)
 */
const cleanUrl = (url) => (url ? url.replace(/\/+$/, "") : "");

/**
 * Helper to safely log admin activities locally or via service call
 */
const safeLogAdminActivity = async (req, moduleName, action, details) => {
  try {
    const paymentUrl = cleanUrl(process.env.PAYMENT_SERVICE_URL);
    if (paymentUrl) {
      const authHeader = req.headers.authorization;
      await axios.post(
        `${paymentUrl}/api/audit-log`,
        { moduleName, action, details },
        { headers: { Authorization: authHeader } }
      );
    }
  } catch (err) {
    console.warn("⚠️ [AUDIT LOG WARNING] Non-blocking log failure:", err.message);
  }
};

/**
 * @desc    Get Admin Dashboard Analytics
 * @route   GET /api/admin/analytics
 * @access  Private (Admin only)
 */
export const getAdminAnalytics = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const courseUrl = cleanUrl(process.env.COURSE_SERVICE_URL);
    const paymentUrl = cleanUrl(process.env.PAYMENT_SERVICE_URL);

    // 1. Local Auth-Service DB queries (Users)
    const totalStudents = await User.countDocuments({ role: "student" });
    const totalInstructors = await User.countDocuments({ role: "instructor" });

    // 2. Fetch Course Telemetry via Inter-Service Communication
    let totalCourses = 0;
    let totalEnrollments = 0;
    let pendingSubmissions = 0;

    if (courseUrl) {
      try {
        // Fallback checks handle both base mounting patterns (/api/courses or root)
        const targetEndpoint = courseUrl.endsWith("/api/courses")
          ? `${courseUrl}/internal/telemetry`
          : `${courseUrl}/api/courses/internal/telemetry`;

        const courseRes = await axios.get(targetEndpoint, {
          headers: { Authorization: authHeader }
        });

        totalCourses = courseRes.data?.totalCourses ?? courseRes.data?.coursesCount ?? 0;
        totalEnrollments = courseRes.data?.totalEnrollments ?? courseRes.data?.enrollmentsCount ?? 0;
        pendingSubmissions = courseRes.data?.pendingSubmissions ?? 0;
      } catch (e) {
        console.error("⚠️ Failed to fetch course telemetry:", e.response?.data || e.message);
      }
    } else {
      console.warn("⚠️ COURSE_SERVICE_URL environment variable is not configured.");
    }

    // 3. Fetch Financial Telemetry via Inter-Service Communication
    let totalRevenue = 0;
    let recentPayments = [];

    if (paymentUrl) {
      try {
        const paymentRes = await axios.get(`${paymentUrl}/api/payments/internal/telemetry`, {
          headers: { Authorization: authHeader }
        });
        totalRevenue = paymentRes.data?.totalRevenue || 0;
        recentPayments = paymentRes.data?.recentPayments || [];
      } catch (e) {
        console.error("⚠️ Failed to fetch payment telemetry:", e.response?.data || e.message);
      }
    }

    // 4. Audit Log
    await safeLogAdminActivity(
      req,
      "ANALYTICS",
      "VIEW",
      "Loaded and viewed main metrics dashboard and financial data streams."
    );

    return res.status(200).json({
      overview: {
        totalStudents,
        totalInstructors,
        totalCourses,
        totalEnrollments,
        totalRevenue,
        pendingSubmissions,
      },
      recentPayments,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Fetch Payment Tickets from Payment Service
 * @route   GET /api/admin/tickets
 * @access  Private (Admin only)
 */
export const getPaymentTickets = async (req, res) => {
  try {
    const paymentUrl = cleanUrl(process.env.PAYMENT_SERVICE_URL);
    if (!paymentUrl) {
      return res.status(503).json({ message: "Payment service endpoint not configured." });
    }

    const authHeader = req.headers.authorization;
    const { data } = await axios.get(`${paymentUrl}/api/payments/tickets`, {
      headers: { Authorization: authHeader }
    });

    await safeLogAdminActivity(
      req,
      "SUPPORT_TICKETS",
      "VIEW",
      "Opened and audited active support tickets data grid."
    );

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Resolve or Reject Payment Ticket
 * @route   PUT /api/admin/tickets/:ticketId
 * @access  Private (Admin only)
 */
export const resolvePaymentTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action, adminNotes } = req.body;
    const paymentUrl = cleanUrl(process.env.PAYMENT_SERVICE_URL);

    if (!paymentUrl) {
      return res.status(503).json({ message: "Payment service endpoint not configured." });
    }

    const authHeader = req.headers.authorization;

    // Forward resolution request to Payment Service
    const { data: ticket } = await axios.put(
      `${paymentUrl}/api/payments/tickets/${ticketId}`,
      { action, adminNotes },
      { headers: { Authorization: authHeader } }
    );

    // Create AI Notification inside Auth Service DB for the target user
    const systemNoticeText =
      action === "resolved"
        ? `🚨 ADMIN UPDATE: Your payment reference "${ticket.paymentReference}" for course "${ticket.courseName}" has been APPROVED. Access provisioned.`
        : `🚨 ADMIN UPDATE: Your payment reference "${ticket.paymentReference}" has been REJECTED. Reason: ${ticket.adminNotes || "Verification failed."}`;

    if (ticket.userId) {
      await AiMessage.create({
        userId: ticket.userId,
        role: "model",
        message: systemNoticeText,
      });
    }

    await safeLogAdminActivity(
      req,
      "SUPPORT_TICKETS",
      "UPDATE",
      `${action.toUpperCase()} payment ticket reference [${ticket.paymentReference}] for course: "${ticket.courseName}".`
    );

    return res.status(200).json({
      message: "Ticket processed successfully and user notified.",
      ticket,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};