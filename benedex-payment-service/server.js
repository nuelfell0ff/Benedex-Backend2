import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./config/db.js";
import { parseJsonBody } from "./middleware/jsonBodyMiddleware.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/errorMiddleware.js";
import notFound from "./middleware/notFoundMiddleware.js";

import paymentRoutes from "./routes/paymentRoutes.js";

connectDB();

const app = express();

app.set("trust proxy", 1);

// Standard Body Parsers (Must come first to prevent hangs)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Raw text parsing for Paystack Webhook payload integrity
app.use(
  express.text({
    type: ["application/json", "application/*+json"],
  })
);
app.use(parseJsonBody);

app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));

app.use("/api", globalLimiter);

// Payment Routes (/api/payments)
app.use("/api/payments", paymentRoutes);

app.get("/health", (req, res) => {
  res.json({ message: "Benedex Payment Service running 🚀" });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PAYMENT_PORT || process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`🚀 Benedex Payment Service running on port ${PORT}`);
});