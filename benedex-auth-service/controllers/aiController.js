import { GoogleGenAI, Type } from "@google/genai";
import AiMessage from "../models/AiMessage.js";
import PaymentTicket from "../models/PaymentTicket.js";

// Helper function to get AI instance cleanly
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

// Function declaration schema for payment ticket tool
const paymentTicketTool = {
  name: "createPaymentTicket",
  description:
    "Creates an official administrative support ticket when a user provides details about a missing or pending payment issue.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      courseName: {
        type: Type.STRING,
        description: "The title of the course the user paid for.",
      },
      paymentReference: {
        type: Type.STRING,
        description:
          "The bank transaction reference, transaction ID, or receipt token code.",
      },
      paymentTime: {
        type: Type.STRING,
        description:
          "The estimated time or date when the payment transfer took place.",
      },
    },
    required: ["courseName", "paymentReference", "paymentTime"],
  },
};

const SYSTEM_INSTRUCTION = `
You are Benedex AI, the official administrative support assistant for the Benedex educational platform.

Your primary purpose is to assist users with platform navigation, settings, and technical or administrative inquiries. 

PAYMENT HANDLING RULE:
- If a user mentions a payment issue, missing access, or transaction failure, politely ask for exactly three pieces of information:
  1. The exact Course Name
  2. The Payment Reference Code/Transaction ID
  3. The approximate Date and Time of payment
- Do NOT call the 'createPaymentTicket' tool until the user has provided ALL THREE pieces of information. 
- If information is missing, politely remind them what is left to provide.
- Once all three details are explicitly provided by the user, invoke the 'createPaymentTicket' tool immediately. Do not make up or guess any details.

CRITICAL ROUTING: 
- This conversation bypasses instructors completely. All tracking goes straight to the Benedex Admin Team. 
- Keep answers polite, direct, concise, and helpful.
`;

// @desc    Handle interactive AI support chat
// @route   POST /api/ai/chat
// @access  Private
export const handleSupportChat = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const trimmedMsg = message.trim();

    // 1. Save incoming user message
    await AiMessage.create({
      userId,
      role: "user",
      message: trimmedMsg,
    });

    // 2. Fetch history context (last 10 messages) using optimized projection
    const recentLogs = await AiMessage.find({ userId })
      .select("role message createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Reconstruct chronological history safely ensuring alternating or valid user/model turns
    const rawLogs = recentLogs.reverse();
    const formattedContents = rawLogs.map((log) => ({
      role: log.role === "model" ? "model" : "user",
      parts: [{ text: String(log.message || "") }],
    }));

    let response;
    try {
      const ai = getAiClient();
      
      // Request AI completion
      response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: formattedContents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [paymentTicketTool] }],
        },
      });
    } catch (apiError) {
      console.error("🔴 [GEMINI API CALL FAILED]:", apiError);
      
      // Fallback text if the external API call fails
      const fallbackAiMsg = "I'm having trouble connecting to my service right now. Please try again shortly or contact support.";
      const savedFallbackMessage = await AiMessage.create({
        userId,
        role: "model",
        message: fallbackAiMsg,
      });
      return res.status(200).json(savedFallbackMessage);
    }

    // 3. Inspect function calls or parts returned by candidate response
    const candidate = response?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    // Check for tool function call
    const functionCallPart = parts.find((p) => p.functionCall);

    if (functionCallPart && functionCallPart.functionCall) {
      const call = functionCallPart.functionCall;

      if (call.name === "createPaymentTicket") {
        const { courseName, paymentReference, paymentTime } = call.args || {};

        // Create support ticket in DB safely
        await PaymentTicket.create({
          userId,
          courseName: courseName || "Unspecified Course",
          paymentReference: paymentReference || "N/A",
          paymentTime: paymentTime || new Date().toISOString(),
          status: "pending",
        });

        const resolutionMessage = `Thank you! I have compiled your details and created an administrative verification ticket (Reference ID: ${
          paymentReference || "N/A"
        }). The Benedex Admin Team will review your transaction logs shortly.`;

        const savedAiMessage = await AiMessage.create({
          userId,
          role: "model",
          message: resolutionMessage,
        });

        return res.status(200).json(savedAiMessage);
      }
    }

    // 4. Extract text response
    let aiReplyText = response?.text;
    if (!aiReplyText && parts.length > 0) {
      const textPart = parts.find((p) => p.text);
      if (textPart) aiReplyText = textPart.text;
    }

    if (!aiReplyText) {
      aiReplyText = "I've logged your request and notified the Benedex administrative team.";
    }

    const savedAiMessage = await AiMessage.create({
      userId,
      role: "model",
      message: aiReplyText,
    });

    return res.status(200).json(savedAiMessage);
  } catch (error) {
    console.error("❌ [AI CONTROLLER ERROR]:", error);
    return res.status(500).json({
      message: "An internal server error occurred while processing your AI request.",
      error: error.message,
    });
  }
};

// @desc    Retrieve user support chat history
// @route   GET /api/ai/history
// @access  Private
export const getSupportHistory = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const history = await AiMessage.find({ userId })
      .select("role message createdAt")
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    return res.status(200).json(history);
  } catch (error) {
    console.error("Failed to retrieve chat history:", error);
    return res
      .status(500)
      .json({ message: "Failed to retrieve history logs." });
  }
};