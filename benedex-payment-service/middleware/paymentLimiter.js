import rateLimit from "express-rate-limit";

// Limits transaction initialization to 10 requests per 15 minutes per IP
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10,
  message: {
    success: false,
    message: "Too many payment initialization attempts. Please try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated webhook rate limiter (higher capacity for Paystack IP servers)
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { success: false, message: "Rate limit exceeded for webhooks." }
});