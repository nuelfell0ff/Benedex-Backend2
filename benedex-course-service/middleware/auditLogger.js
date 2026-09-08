import axios from "axios";

// Helper to strip trailing slashes
const normalizeAuthUrl = (url) => {
  if (!url) return "";
  return url.replace(/\/+$/, "");
};

// 1. Direct utility function for explicitly logging complex manual edits via HTTP
export const logAdminActivity = async (req, moduleName, actionType, detailsString) => {
  try {
    const authUrl = normalizeAuthUrl(process.env.AUTH_SERVICE_URL);
    if (!authUrl) return;

    const authHeader = req.headers?.authorization;

    // Dispatch audit log payload to benedex-auth-service asynchronously
    await axios.post(
      `${authUrl}/api/audit-log`,
      {
        module: moduleName,
        actionType: actionType,
        details: detailsString,
        ipAddress: req.ip || req.headers?.["x-forwarded-for"],
        device: req.headers?.["user-agent"]
      },
      {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("Audit logging execution engine background error:", err.response?.data || err.message);
  }
};

// 2. Middleware to automatically log Page Views effortlessly when applied to routes
export const trackPageView = (moduleName) => {
  return async (req, res, next) => {
    // Only log if user is authenticated via your protect middleware
    if (req.user) {
      logAdminActivity(
        req,
        moduleName,
        "VIEW",
        `Accessed and viewed the ${moduleName.toLowerCase()} interface page panel.`
      );
    }
    next();
  };
};