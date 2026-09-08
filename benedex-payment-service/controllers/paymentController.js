import axios from "axios";
import crypto from "crypto";
import Payment from "../models/Payment.js";

// Helper to strip trailing slashes and redundant api/courses suffix
const normalizeCourseUrl = (url) => {
  if (!url) return "";
  let cleaned = url.replace(/\/+$/, "");
  if (cleaned.endsWith("/api/courses")) {
    cleaned = cleaned.replace(/\/api\/courses$/, "");
  } else if (cleaned.endsWith("/api")) {
    cleaned = cleaned.replace(/\/api$/, "");
  }
  return cleaned;
};

// Safe student population wrapper (prevents crash if User model/DB is separated)
const safelyPopulateStudent = (query) => {
  try {
    return query.populate("student", "fullName email");
  } catch (err) {
    console.warn("⚠️ Cross-service notice: Student local population skipped:", err.message);
    return query;
  }
};

// Helper function to handle enrollment via Course Service over HTTP
const processSuccessfulEnrollment = async (payment, authHeader) => {
  if (payment.status === "success") return; // Idempotency check

  payment.status = "success";
  await payment.save();

  const baseUrl = normalizeCourseUrl(process.env.COURSE_SERVICE_URL);
  if (baseUrl) {
    try {
      await axios.post(
        `${baseUrl}/api/courses/${payment.course}/enroll`,
        { studentId: payment.student },
        { headers: { Authorization: authHeader } }
      );
    } catch (err) {
      console.error("⚠️ Failed to trigger auto-enrollment in Course Service:", err.response?.data || err.message);
    }
  }
};

// Helper function to fetch course catalog and map IDs to titles
const fetchAndMapCourses = async (courseIds, authHeader) => {
  const courseMap = {};
  const baseUrl = normalizeCourseUrl(process.env.COURSE_SERVICE_URL);

  if (!baseUrl || courseIds.length === 0) return courseMap;

  try {
    const courseResponse = await axios.get(`${baseUrl}/api/courses`, {
      headers: { Authorization: authHeader }
    });

    const resData = courseResponse.data;
    const courses = Array.isArray(resData)
      ? resData
      : resData?.courses || resData?.data || [];

    courses.forEach((c) => {
      if (c && c._id) {
        courseMap[c._id.toString()] = { _id: c._id, title: c.title || "Untitled Course" };
      }
    });
  } catch (err) {
    console.error("⚠️ Failed to fetch course metadata from Course Service:", err.response?.data || err.message);
  }

  return courseMap;
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

    const baseUrl = normalizeCourseUrl(process.env.COURSE_SERVICE_URL);
    if (!baseUrl) {
      return res.status(503).json({ success: false, message: "Course Service URL not configured." });
    }

    const courseResponse = await axios.get(`${baseUrl}/api/courses/${courseId}`, {
      headers: { Authorization: authHeader }
    });

    const course = courseResponse.data?.course || courseResponse.data;
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
          courseId: (course._id || courseId).toString(),
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
      course: course._id || courseId,
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

    if (userId && payment.student && payment.student.toString() !== userId.toString()) {
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
    let query = Payment.find({}).sort({ createdAt: -1 }).lean();
    query = safelyPopulateStudent(query);

    const payments = await query;

    const courseIds = [...new Set(payments.map((p) => p.course).filter(Boolean))];
    const courseMap = await fetchAndMapCourses(courseIds, req.headers.authorization);

    const enrichedPayments = payments.map((payment) => {
      const courseIdStr = payment.course?.toString();
      return {
        ...payment,
        course: courseMap[courseIdStr] || { _id: payment.course, title: "Purged Syllabus Node" }
      };
    });

    return res.json({ success: true, count: enrichedPayments.length, payments: enrichedPayments });
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

    let query = Payment.find({}).sort({ createdAt: -1 }).limit(5).lean();
    query = safelyPopulateStudent(query);

    const recentPayments = await query;

    const courseIds = [...new Set(recentPayments.map((p) => p.course).filter(Boolean))];
    const courseMap = await fetchAndMapCourses(courseIds, req.headers.authorization);

    const enrichedRecent = recentPayments.map((payment) => {
      const courseIdStr = payment.course?.toString();
      return {
        ...payment,
        course: courseMap[courseIdStr] || { _id: payment.course, title: "Purged Syllabus Node" }
      };
    });

    return res.json({
      success: true,
      totalRevenue,
      recentPayments: enrichedRecent
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
    let query = Payment.find({ status: "pending" }).sort({ createdAt: -1 }).lean();
    query = safelyPopulateStudent(query);

    const pendingTickets = await query;

    const courseIds = [...new Set(pendingTickets.map((p) => p.course).filter(Boolean))];
    const courseMap = await fetchAndMapCourses(courseIds, req.headers.authorization);

    const enrichedTickets = pendingTickets.map((ticket) => {
      const courseIdStr = ticket.course?.toString();
      return {
        ...ticket,
        course: courseMap[courseIdStr] || { _id: ticket.course, title: "Purged Syllabus Node" }
      };
    });

    return res.json(enrichedTickets);
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