import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import verifyToken from "./joss/verifyToken.js";

const app = express();
const PORT = process.env.PORT || 8000;

// ========================================
// TRUSTED ORIGINS
// ========================================
// The frontend is expected to call this API through a same-origin Next.js
// proxy (/api/backend/...), which forwards the Better Auth session cookie.
// Direct cross-origin requests are only allowed from explicitly trusted
// origins. No wildcard origins with credentials.
const frontendURL = process.env.AUTH_BASE_URL || "http://localhost:3000";
const allowedOrigins = [
  frontendURL,
  "http://localhost:3000", // local development
  process.env.BACKEND_URL, // this backend's own deployment URL
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : []),
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/$/, ""));

const originsMatch = (origin) => allowedOrigins.includes(origin.replace(/\/$/, ""));

// ----------------------------------------
// Middleware
// ----------------------------------------
app.use(
  cors({
    // Untrusted origins get no CORS headers (browser blocks the response)
    // instead of a CORS error response, keeping the API usable server-side.
    origin: (origin, callback) => {
      if (!origin || originsMatch(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.disable("x-powered-by");

app.use(express.json());
app.use(cookieParser());

// ----------------------------------------
// CSRF protection for state-changing requests
// ----------------------------------------
// Requests carrying an Origin/Referer from an untrusted origin are rejected.
// Requests without these headers (curl, server-to-server, the Next.js proxy)
// are allowed: session cookies live on the frontend domain and are HttpOnly,
// so the browser-side SameSite policy prevents cross-site cookie attachment.
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.use((req, res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.get("origin") ||
    (req.get("referer") ? new URL(req.get("referer")).origin : null);

  if (origin && !originsMatch(origin)) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Untrusted request origin",
    });
  }

  return next();
});

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);

let db;

// Get today's date in Bangladesh timezone (YYYY-MM-DD)
const getTodayDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year").value;
  const month = parts.find((part) => part.type === "month").value;
  const day = parts.find((part) => part.type === "day").value;

  return `${year}-${month}-${day}`;
};

// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "StudioSpace API is running",
    database: db ? "Connected" : "Disconnected",
  });
});

// Protected Test API
app.get("/api/protected", verifyToken, (req, res) => {
  res.status(200).json({
    success: true,
    message: "You are authenticated",
    user: req.user,
  });
});

// ========================================
// STUDIO APIs
// ========================================

// Get My Studio Listings
app.get("/api/studios/my-listings", verifyToken, async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find({ "host.id": req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Your studio listings fetched successfully",
      data: studios,
    });
  } catch (error) {
    console.error("My listings error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your studio listings",
    });
  }
});

// Get All Studios
app.get("/api/studios", async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      data: studios,
    });
  } catch (error) {
    console.error("Fetch studios error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch studios",
    });
  }
});

// Get Featured Studios (Latest 6)
app.get("/api/studios/featured", async (req, res) => {
  try {
    const studios = await db
      .collection("studios")
      .find()
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      message: "Featured studios fetched successfully",
      data: studios,
    });
  } catch (error) {
    console.error("Featured studios error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch featured studios",
    });
  }
});

// Get Single Studio
app.get("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(id),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found",
      });
    }

    res.status(200).json({
      success: true,
      data: studio,
    });
  } catch (error) {
    console.error("Get studio error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch studio",
    });
  }
});

// Create Studio
app.post("/api/studios", verifyToken, async (req, res) => {
  try {
    const {
      title,
      category,
      hourlyRate,
      securityDeposit,
      capacity,
      location,
      image,
      amenities,
      description,
    } = req.body;

    if (
      !title ||
      !category ||
      hourlyRate == null ||
      capacity == null ||
      !location ||
      !image ||
      !description
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    const newStudio = {
      title,
      category,
      hourlyRate: Number(hourlyRate),
      securityDeposit: Number(securityDeposit || 0),
      capacity: Number(capacity),
      location,
      image,
      amenities: Array.isArray(amenities) ? amenities : [],
      description,
      host: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
      createdAt: new Date(),
    };

    const result = await db.collection("studios").insertOne(newStudio);

    res.status(201).json({
      success: true,
      message: "Studio created successfully",
      data: {
        _id: result.insertedId,
        ...newStudio,
      },
    });
  } catch (error) {
    console.error("Studio creation error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create studio",
    });
  }
});

// Update Studio
app.put("/api/studios/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const {
      title,
      category,
      hourlyRate,
      securityDeposit,
      capacity,
      location,
      image,
      amenities,
      description,
    } = req.body;

    if (
      !title?.trim() ||
      !category ||
      !location?.trim() ||
      !image?.trim() ||
      !description?.trim() ||
      !Array.isArray(amenities) ||
      !Number.isFinite(Number(hourlyRate)) ||
      Number(hourlyRate) <= 0 ||
      !Number.isFinite(Number(securityDeposit)) ||
      Number(securityDeposit) < 0 ||
      !Number.isInteger(Number(capacity)) ||
      Number(capacity) < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid studio information",
      });
    }

    const updatedStudio = {
      title: title.trim(),
      category,
      hourlyRate: Number(hourlyRate),
      securityDeposit: Number(securityDeposit),
      capacity: Number(capacity),
      location: location.trim(),
      image: image.trim(),
      amenities,
      description: description.trim(),
      updatedAt: new Date(),
    };

    const result = await db.collection("studios").updateOne(
      {
        _id: new ObjectId(id),
        "host.id": req.user.id,
      },
      {
        $set: updatedStudio,
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Studio not found or you are not authorized",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(id),
    });

    res.status(200).json({
      success: true,
      message: "Studio updated successfully",
      data: studio,
    });
  } catch (error) {
    console.error("Update studio error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update studio",
    });
  }
});

// Delete Studio
app.delete("/api/studios/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const result = await db.collection("studios").deleteOne({
      _id: new ObjectId(id),
      "host.id": req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Studio not found or you are not authorized",
      });
    }

    res.status(200).json({
      success: true,
      message: "Studio deleted successfully",
    });
  } catch (error) {
    console.error("Delete studio error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete studio",
    });
  }
});

// ========================================
// BOOKING APIs
// ========================================

// Create Booking
app.post("/api/bookings", verifyToken, async (req, res) => {
  try {
    const { studioId, bookingDate, startTime, endTime } = req.body;

    // Validate required fields
    if (!studioId || !bookingDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Please provide all booking information",
      });
    }

    // Validate Studio ID
    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    // Validate date and time formats
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (
      !datePattern.test(bookingDate) ||
      !timePattern.test(startTime) ||
      !timePattern.test(endTime)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking date or time",
      });
    }

    // Validate actual calendar date
    const [year, month, day] = bookingDate.split("-").map(Number);

    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking date",
      });
    }

    // Prevent past date booking (Bangladesh timezone)
    const today = getTodayDate();

    if (bookingDate < today) {
      return res.status(400).json({
        success: false,
        message: "Booking date cannot be in the past",
      });
    }

    // End time must be later than start time
    if (endTime <= startTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be later than start time",
      });
    }

    // Prevent booking earlier time on the same day
    if (bookingDate === today) {
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());

      if (startTime <= now) {
        return res.status(400).json({
          success: false,
          message: "Booking start time must be in the future",
        });
      }
    }

    // Find Studio
    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found",
      });
    }

    // Prevent booking own studio
    if (studio.host?.id === req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You cannot book your own studio",
      });
    }

    // Validate studio pricing
    if (
      !Number.isFinite(Number(studio.hourlyRate)) ||
      Number(studio.hourlyRate) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Studio hourly rate is invalid",
      });
    }

    const securityDeposit = Number(studio.securityDeposit || 0);

    // Check overlapping bookings
    const existingBooking = await db.collection("bookings").findOne({
      studioId: studioId,
      bookingDate: bookingDate,
      status: { $in: ["pending", "confirmed"] },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "This studio is already booked for the selected time",
      });
    }

    // Calculate booking duration
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const totalHours = (endMinutes - startMinutes) / 60;

    // Calculate total price on the server
    const totalAmount =
      totalHours * Number(studio.hourlyRate) + securityDeposit;

    // Prepare booking data
    const newBooking = {
      studioId: studio._id.toString(),
      studioTitle: studio.title,
      studioImage: studio.image,
      hostId: studio.host.id,
      hostName: studio.host.name,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      bookingDate,
      startTime,
      endTime,
      totalHours,
      hourlyRate: Number(studio.hourlyRate),
      securityDeposit,
      totalAmount,
      status: "pending",
      createdAt: new Date(),
    };

    // Save booking to MongoDB
    const result = await db.collection("bookings").insertOne(newBooking);

    res.status(201).json({
      success: true,
      message: "Booking request submitted successfully",
      data: {
        _id: result.insertedId,
        ...newBooking,
      },
    });
  } catch (error) {
    console.error("Create booking error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create booking",
    });
  }
});

// Get My Bookings
app.get("/api/bookings/my-bookings", verifyToken, async (req, res) => {
  try {
    const bookings = await db
      .collection("bookings")
      .find({
        userId: req.user.id,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Your bookings fetched successfully",
      data: bookings,
    });
  } catch (error) {
    console.error("My bookings error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your bookings",
    });
  }
});

// Cancel Pending Booking
app.patch("/api/bookings/:id/cancel", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(id),
        userId: req.user.id,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending booking not found or you are not authorized",
      });
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
    });
  }
});

// ========================================
// SERVER / DATABASE LIFECYCLE
// ========================================

async function connectDB() {
  await client.connect();

  db = client.db("studio-space");

  console.log("MongoDB connected successfully");
}

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

// Export the Express app for the Vercel serverless handler (api/index.js).
// app.listen() runs only for local development so the serverless runtime
// is never asked to start a persistent server.
export default app;
export { connectDB, startServer };

if (!process.env.VERCEL) {
  startServer();
}
