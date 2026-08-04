import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import { recordLearningActivity } from "../utils/studentLearning.js";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to send HttpOnly cookie with 24-hour expiration
const sendTokenResponse = (user, statusCode, res) => {
    // Embed user._id AND user.role into the signed JWT
    const token = generateToken(user._id, user.role);

    const cookieOptions = {
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // Token/Cookie expires in 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    };

    res.status(statusCode)
        .cookie("token", token, cookieOptions)
        .json({
            success: true,
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            profileImage: user.profileImage,
            token
        });
};

// @desc    Register standard user
// @route   POST /api/auth/register
export const registerUser = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "Please supply all required fields." });
        }

        const normalizedEmail = String(email).toLowerCase().trim();

        const userExists = await User.findOne({ email: normalizedEmail });
        if (userExists) {
            return res.status(400).json({ message: "User already exists with that email address." });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Enforce default role to prevent privilege escalation
        const user = await User.create({
            fullName: String(fullName).trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: "student"
        });

        if (user.role === "student") {
            await recordLearningActivity({
                student: user._id,
                type: "account_registered",
                title: "Created your account",
                points: 0
            });
        }

        sendTokenResponse(user, 201, res);
    } catch (error) {
        res.status(500).json({ message: "Registration error: " + error.message });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Please provide an email and password." });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).select("+password");

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        if (user.status === "suspended") {
            return res.status(403).json({ message: "Your account has been suspended. Please contact support." });
        }

        if (!user.password) {
            return res.status(400).json({
                message: "Account created via Google OAuth. Please sign in with Google."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        if (user.role === "student") {
            await recordLearningActivity({
                student: user._id,
                type: "user_logged_in",
                title: "Logged in",
                points: 0
            });
        }

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({ message: "Login failure: " + error.message });
    }
};

// @desc    Google OAuth Callback
// @route   POST /api/auth/google
export const googleAuthCallbackSuccess = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ message: "Google verification token missing." });
        }

        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload["sub"];
        const email = payload["email"].toLowerCase();
        const fullName = payload["name"];
        const profileImage = payload["picture"];

        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (!user) {
            user = await User.create({
                fullName,
                email,
                googleId,
                profileImage: profileImage || "",
                role: "student"
            });

            await recordLearningActivity({
                student: user._id,
                type: "account_registered",
                title: "Created your account via Google",
                points: 0
            });
        } else if (!user.googleId) {
            user.googleId = googleId;
            if (!user.profileImage && profileImage) user.profileImage = profileImage;
            await user.save();
        }

        if (user.status === "suspended") {
            return res.status(403).json({ message: "Account is suspended." });
        }

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({ message: "Google OAuth failure: " + error.message });
    }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const genericResponse = {
            success: true,
            message: "If an account exists with that email address, a reset code has been sent."
        };

        if (!email) return res.status(200).json(genericResponse);

        const normalizedEmail = String(email).toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(200).json(genericResponse);
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        user.resetPasswordToken = crypto.createHash("sha256").update(verificationCode).digest("hex");
        user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        await user.save();

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || "smtp.gmail.com",
            port: Number(process.env.EMAIL_PORT) || 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: `"Benedex Support" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your Password Reset Verification Code",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #194066; text-align: center;">Password Reset Request</h2>
                    <p>Hello ${user.fullName},</p>
                    <p>Use the code below to complete your password reset. This code is active for <strong>10 minutes</strong>.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 12px 24px; background-color: #f4f6f8; border-radius: 4px; color: #1E844F; border: 1px dashed #1E844F;">
                            ${verificationCode}
                        </span>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json(genericResponse);
    } catch (error) {
        res.status(500).json({ message: "Email system error: " + error.message });
    }
};

// @desc    Reset Password
// @route   PUT /api/auth/reset-password/:token
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long." });
        }

        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        }).select("+resetPasswordToken +resetPasswordExpires");

        if (!user) {
            return res.status(400).json({ message: "Reset code is invalid or has expired." });
        }

        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(password, salt);

        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password updated successfully. You can now log in."
        });
    } catch (error) {
        res.status(500).json({ message: "Reset error: " + error.message });
    }
};

// @desc    Update Password
// @route   PUT /api/auth/update-password
// @access  Private
export const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters long." });
        }

        const user = await User.findById(req.user?._id).select("+password");
        if (!user) {
            return res.status(404).json({ message: "User account not found." });
        }

        if (user.password) {
            if (!currentPassword) {
                return res.status(400).json({ message: "Current password is required." });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: "Incorrect current password." });
            }
        }

        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password updated successfully."
        });
    } catch (error) {
        res.status(500).json({ message: "Update password error: " + error.message });
    }
};

// @desc    Logout User / Invalidate Token Cookie
// @route   POST /api/auth/logout
// @access  Private
export const logoutUser = async (req, res) => {
    res.cookie("token", "", {
        httpOnly: true,
        expires: new Date(0),
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    });

    res.status(200).json({
        success: true,
        message: "Successfully logged out."
    });
};