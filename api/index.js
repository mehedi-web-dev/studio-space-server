// Vercel serverless handler for the Express app.
// The handler returns the exported Express app directly (it is a valid
// Node request listener). MongoDB connects lazily on the first invocation
// per lambda instance and is reused across warm invocations.
import app, { connectDB } from "../index.js";

let dbReady;

export default async function handler(req, res) {
  try {
    // Reuse the connection promise across warm invocations.
    dbReady ??= connectDB();
    await dbReady;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    dbReady = undefined; // allow retry on the next invocation

    return res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }

  return app(req, res);
}
