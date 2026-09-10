import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";
import apicache from "apicache";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const cache = apicache.middleware;

app.use(helmet());
app.use(morgan("dev"));

// Helper to sanitize base targets (removes trailing slashes and /api suffix)
const cleanTargetUrl = (url, fallback) => {
  const target = url || fallback;
  return target.replace(/\/+$/, "").replace(/\/api$/, "");
};

const AUTH_TARGET = cleanTargetUrl(process.env.AUTH_SERVICE_URL, "http://127.0.0.1:5001");
const COURSE_TARGET = cleanTargetUrl(process.env.COURSE_SERVICE_URL, "http://127.0.0.1:5002");
const PAYMENT_TARGET = cleanTargetUrl(process.env.PAYMENT_SERVICE_URL, "http://127.0.0.1:5003");

// CORS Configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:5173" || "https://benedex.org",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  maxAge: 86400,
};

app.use(cors(corsOptions));

// Logging incoming requests
app.use((req, res, next) => {
  console.log(`🌐 [GATEWAY INCOMING] ${req.method} ${req.originalUrl}`);
  next();
});

// Gateway Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Benedex API Gateway running healthy 🚀" });
});

// Cache condition helper
const only200 = (req, res) => res.statusCode === 200;

// Apply apicache to high-frequency GET routes
app.use(
  "/api/dashboard/student",
  cache("10 seconds", only200, {
    appendKey: (req) => req.headers.authorization || "",
  })
);

app.use(
  ["/api/lessons/progress", "/api/live-classes/student"],
  cache("15 seconds", only200, {
    appendKey: (req) => req.headers.authorization || "",
  })
);

// Route Map
const serviceRoutes = [
  // Auth Service
  { prefix: "/api/auth", target: AUTH_TARGET },
  { prefix: "/api/admin", target: AUTH_TARGET },
  { prefix: "/api/users", target: AUTH_TARGET },
  { prefix: "/api/community", target: AUTH_TARGET },
  { prefix: "/api/ai", target: AUTH_TARGET },
  { prefix: "/api/dashboard", target: AUTH_TARGET },
  { prefix: "/api/messages", target: AUTH_TARGET },
  { prefix: "/api/notifications", target: AUTH_TARGET },
  { prefix: "/api/notifications-list", target: AUTH_TARGET },
  { prefix: "/api/search", target: AUTH_TARGET },
  { prefix: "/api/settings", target: AUTH_TARGET },
  { prefix: "/api/student", target: AUTH_TARGET },

  // Course Service
  { prefix: "/api/courses", target: COURSE_TARGET },
  { prefix: "/api/modules", target: COURSE_TARGET },
  { prefix: "/api/lessons", target: COURSE_TARGET },
  { prefix: "/api/assignments", target: COURSE_TARGET },
  { prefix: "/api/quizzes", target: COURSE_TARGET },
  { prefix: "/api/certificates", target: COURSE_TARGET },
  { prefix: "/api/live-classes", target: COURSE_TARGET },
  { prefix: "/api/instructor", target: COURSE_TARGET },
  { prefix: "/api/rewards", target: COURSE_TARGET },

  // Payment Service
  { prefix: "/api/payments", target: PAYMENT_TARGET },
];

// Mount Proxies WITH full path preservation
serviceRoutes.forEach(({ prefix, target }) => {
  app.use(
    prefix,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      proxyTimeout: 30000, // 30s timeout to survive cold boots
      timeout: 30000,
      pathRewrite: (path, req) => req.originalUrl,
      on: {
        proxyReq: (proxyReq, req) => {
          if (req.headers.authorization) {
            proxyReq.setHeader("Authorization", req.headers.authorization);
          }
          console.log(
            `🔀 [GATEWAY PROXY] Forwarding ${req.method} ${req.originalUrl} ---> ${target}${req.originalUrl}`
          );
        },
        proxyRes: (proxyRes, req) => {
          console.log(
            `✅ [GATEWAY RESPONSE] ${proxyRes.statusCode} from ${target}${req.originalUrl}`
          );
        },
        error: (err, req, res) => {
          console.error(`❌ [GATEWAY ERROR] Connection to ${target} failed:`, err.message);
          if (!res.headersSent) {
            res.status(504).json({
              message: "Target microservice starting up or unreachable. Retrying...",
              error: err.message,
            });
          }
        },
      },
    })
  );
});

// Fallback for unmatched routes
app.use((req, res) => {
  res.status(404).json({ message: "Requested endpoint not found on Benedex API Gateway" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Benedex API Gateway running on http://localhost:${PORT}`);
});