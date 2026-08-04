import jwt from "jsonwebtoken";

export const protect = async (req, res, next) => {
  let token;

  // 1. Check Bearer token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } 
  // 2. Fallback to HTTP-only Cookie if headers are missing
  else if (req.cookies?.jwt || req.cookies?.token) {
    token = req.cookies.jwt || req.cookies.token;
  }

  // 3. Reject early if no token found
  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("❌ [AUTH ERROR] JWT_SECRET is not defined in environment variables!");
      return res.status(500).json({ message: "Server configuration error" });
    }

    // 4. Verify token statelessly
    const decoded = jwt.verify(token, secret);

    // 5. Attach decoded payload directly
    req.user = {
      _id: decoded.id || decoded._id,
      id: decoded.id || decoded._id,
      role: decoded.role || "student",
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error("❌ [AUTH ERROR] JWT Verification Failed:", error.message);
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `User role '${req.user?.role || "unknown"}' is not authorized to access this route`,
      });
    }
    next();
  };
};