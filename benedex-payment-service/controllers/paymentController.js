import axios from "axios";
import crypto from "crypto";
import Payment from "../models/Payment.js";

const cleanUrl = (url) => (url ? url.replace(/\/+$/, "") : "");

// Helper function to handle enrollment via Course Service over HTTP
const processSuccessfulEnrollment = async (payment, authHeader) => {
  if (payment.status === "success") return; // Idempotency check

  payment.status = "success";
  await payment.save();

  const courseUrl = cleanUrl(process.env.COURSE_SERVICE_URL);
  if (courseUrl) {
    try {
      await axios.post(
        `${courseUrl}/api/courses/${payment.course}/enroll`,
        { studentId: payment.student },
        { headers: { Authorization: authHeader } }
      );
    } catch (err) {
      console.error("⚠️ Failed to trigger auto-enrollment in Course Service:", err.response?.data || err.message);
    }
  }
};

// 1️⃣ INITIALIZE PAYMENT
export const initializePayment = async (req, res) => {
  try {
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey || paystackKey === "your_secret_key") {
      return res.status(500).json({
        success: false,
        message: "Server misconfiguration: PAYSTACK_SECRET_KEY is missing."
      });
    }

    const { courseId, callbackUrl, email } = req.body;

    // Multi-level fallback to ensure a valid email string reaches Paystack
    const userEmail = req.user?.email || email || req.body.userEmail;
    const userId = req.user?._id || req.user?.id || req.body.userId;
    const authHeader = req.headers.authorization;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: "User email address is required to initialize payment."
      });
    }

    if (!courseId) {
      return res.status(400).json({ success: false, message: "Valid Course ID is required" });
    }

    const courseUrl = cleanUrl(process.env.COURSE_SERVICE_URL);
    if (!courseUrl) {
      return res.status(503).json({ success: false, message: "Course Service URL not configured." });
    }

    const courseResponse = await axios.get(`${courseUrl}/api/courses/${courseId}`, {
      headers: { Authorization: authHeader }
    });

    const course = courseResponse.data;
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    if (course.students && userId && course.students.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You are already enrolled in this course."
      });
    }

    const reference = `BEN_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const baseFrontend = process.env.CLIENT_URL || "http://localhost:5173";
    const finalCallbackUrl = callbackUrl || `${baseFrontend}/payments/callback`;

    const amountInKobo = Math.round(course.price * 100);

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: userEmail,
        amount: amountInKobo,
        reference,
        callback_url: finalCallbackUrl,
        metadata: {
          studentId: userId ? userId.toString() : "",
          courseId: course._id.toString(),
          paymentType: "course_enrollment"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    await Payment.create({
      student: userId,
      course: course._id,
      amount: course.price,
      reference,
      status: "pending"
    });

    res.json({
      success: true,
      authorization_url: response.data.data.authorization_url,
      reference
    });

  } catch (error) {
    console.error("Payment initialize error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || "Payment initialization failed"
    });
  }
};

// 2️⃣ VERIFY PAYMENT
export const verifyPayment = async (req, res) => {
  try {
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) {
      return res.status(500).json({ success: false, message: "PAYSTACK_SECRET_KEY is missing." });
    }

    const { reference } = req.params;
    const userId = req.user?._id || req.user?.id;
    const authHeader = req.headers.authorization;

    if (!reference) {
      return res.status(400).json({ success: false, message: "Payment reference is required." });
    }

    const payment = await Payment.findOne({ reference });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment record not found." });
    }

    if (userId && payment.student.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this payment." });
    }

    if (payment.status === "success") {
      return res.json({
        success: true,
        courseId: payment.course,
        message: "Payment already verified and active."
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${paystackKey}` } }
    );

    if (response.data.data.status === "success") {
      await processSuccessfulEnrollment(payment, authHeader);

      return res.json({
        success: true,
        courseId: payment.course,
        message: "Payment verified and enrollment completed"
      });
    }

    payment.status = "failed";
    await payment.save();

    res.status(400).json({
      success: false,
      courseId: payment.course,
      message: "Paystack did not confirm this payment"
    });

  } catch (error) {
    console.error("Payment verify error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || "Payment verification failed"
    });
  }
};

// 3️⃣ PAYSTACK WEBHOOK HANDLER
export const handlePaystackWebhook = async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const hash = crypto
      .createHmac("sha512", secret)
      .update(typeof req.body === "string" ? req.body : JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).send("Invalid signature");
    }

    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    if (event.event === "charge.success") {
      const { reference } = event.data;
      const payment = await Payment.findOne({ reference });

      if (payment && payment.status !== "success") {
        await processSuccessfulEnrollment(payment, null);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Paystack Webhook error:", error.message);
    res.status(500).send("Webhook processing error");
  }
};

// 4️⃣ ADMIN: GET ALL PAYMENTS
export const getAllPaymentsForAdmin = async (req, res) => {
  try {
    const payments = await Payment.find({})
      .populate("student", "fullName email")
      .sort({ createdAt: -1 });

    return res.json({ success: true, count: payments.length, payments });
  } catch (error) {
    console.error("Admin payments fetch failure:", error.message);
    return res.status(500).json({ message: "Failed to retrieve transactions" });
  }
};

// 5️⃣ INTERNAL TELEMETRY FOR ADMIN DASHBOARD
export const getPaymentTelemetry = async (req, res) => {
  try {
    const revenueResult = await Payment.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    const recentPayments = await Payment.find({})
      .populate("student", "fullName email")
      .sort({ createdAt: -1 })
      .limit(5);

    return res.json({
      success: true,
      totalRevenue,
      recentPayments
    });
  } catch (error) {
    console.error("Telemetry fetch error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to compile payment telemetry" });
  }
};

// 6️⃣ ADMIN: AUDIT LOG ROUTE HANDLER
export const logAuditActivity = async (req, res) => {
  try {
    const { moduleName, action, details } = req.body;
    console.log(`[AUDIT LOG] ${moduleName} | ${action}: ${details}`);
    return res.status(201).json({ success: true, message: "Audit log recorded successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// 7️⃣ ADMIN: GET SUPPORT/PAYMENT TICKETS
export const getPaymentTickets = async (req, res) => {
  try {
    const pendingTickets = await Payment.find({ status: "pending" })
      .populate("student", "fullName email")
      .sort({ createdAt: -1 });

    return res.json(pendingTickets);
  } catch (error) {
    console.error("Get tickets error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};

// 8️⃣ ADMIN: RESOLVE OR REJECT PAYMENT TICKET
export const resolvePaymentTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action, adminNotes } = req.body;
    const authHeader = req.headers.authorization;

    const payment = await Payment.findById(ticketId);
    if (!payment) {
      return res.status(404).json({ message: "Payment ticket not found." });
    }

    if (action === "resolved") {
      await processSuccessfulEnrollment(payment, authHeader);
    } else if (action === "rejected") {
      payment.status = "failed";
      await payment.save();
    }

    return res.json({
      _id: payment._id,
      userId: payment.student,
      paymentReference: payment.reference,
      status: payment.status,
      adminNotes: adminNotes || ""
    });
  } catch (error) {
    console.error("Resolve ticket error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};