import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Protect routes by verifying JWT token locally or via DB lookup
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attempt DB lookup if email is missing from JWT payload
    let email = decoded.email;
    let role = decoded.role;

    if (!email && User) {
      try {
        const dbUser = await User.findById(decoded.id || decoded._id).select("email role");
        if (dbUser) {
          email = dbUser.email;
          role = dbUser.role || role;
        }
      } catch (dbErr) {
        // Fallback silently if DB lookup fails or User model isn't connected
      }
    }

    // Attach complete decoded user info directly to req.user
    req.user = {
      _id: decoded.id || decoded._id,
      id: decoded.id || decoded._id,
      email: email,
      role: role,
    };

    next();
  } catch (error) {
    console.error("JWT Verification failed in Payment Service:", error.message);
    return res.status(401).json({ success: false, message: "Not authorized, token invalid or expired" });
  }
};

/**
 * Restrict access to specific roles (e.g., admin)
 */
export const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({ success: false, message: "Access restricted to administrators" });
  }
};