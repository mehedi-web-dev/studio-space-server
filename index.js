import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import verifyToken from "./joss/verifyToken.js";

const app = express();
const PORT = 8000;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let db;

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "StudioSpace API is running",
    database: db ? "Connected" : "Disconnected",
  });
});

app.get("/api/protected", verifyToken, (req, res) => {
  res.status(200).json({
    success: true,
    message: "You are authenticated",
    user: req.user,
  });
});



async function startServer() {
  try {
    await client.connect();

   db = client.db("studio-space");

    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}



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


//edit a studio listing

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




//delete a studio listing
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


startServer();
