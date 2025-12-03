const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require("fs");
const cors = require("cors");
require('dotenv').config();

const app = express();
// Render sets its own port in process.env.PORT
// App can run on render and locally
const port = process.env.PORT || 3000;

// CORS - required for GitHub Pages to Render
app.use(cors());

// Serve CSS 
app.use('/css', express.static(path.join(__dirname, '../CW1_Full_Stack_Development')));

// Middleware
app.use(express.json());

// Logger Middleware - to track all requests to the server
app.use(function (request, response, next) {
    console.log("In comes a " + request.method + " to " + request.url);
    next();
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Static middleware for lesson images
app.use(function (req, res, next) {
    if (!req.url.startsWith("/images/")) {
        next();
        return;
    }

    const fileName = req.url.replace("/images/", ""); 
    const filePath = path.join(__dirname, "static", fileName);

    fs.stat(filePath, function (err, fileInfo) {
        if (err || !fileInfo.isFile()) {
            res.status(404).send("Image file not found!");
            return;
        }
        res.sendFile(filePath);
    });
});

// MongoDB connection
const url = process.env.MONGO_URL; // load mongodb url from .env file
const client = new MongoClient(url, {
  serverApi: { version: "1", strict: true, deprecationErrors: true }
});
let db;

async function ConnectMongoDB() {
  try {
    await client.connect();
    db = client.db('afterSchoolDB'); 
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
  }
}

// Routes 
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../CW1_Full_Stack_Development/index.html'));
});

// Get all lessons from mongodb
app.get('/lessons', async (req, res) => {
  try {
    const allLessons = await db.collection('lessons').find({}).toArray();
    res.json(allLessons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Search results from mongodb based on query 
app.get('/search', async (req, res) => {
  try {
    const query = req.query.query?.toLowerCase() || '';

    // If search box is empty, show all lessons
    if (query === '') {
      const allLessons = await db.collection('lessons').find({}).toArray();
      return res.json(allLessons);
    }

    // Checks if query is numeric
    const numericQuery = Number(query);
    const isNumeric = !isNaN(numericQuery);

    const filter = isNumeric ? {
        $or: [
          { $expr: { $regexMatch: { input: { $toString: "$price" }, regex: query } } },
          { $expr: { $regexMatch: { input: { $toString: "$spaces" }, regex: query } } }
        ]
    } : {
        $or: [
            { subject: { $regex: query, $options: 'i' } }, // finds anything that contains the query
            { location: { $regex: query, $options: 'i' } }, // options for Mongodb search results - case insensitive (i)
        ],
    };
    const lessons = await db.collection('lessons').find(filter).toArray();

    res.json(lessons);
  } catch (error) {
    console.error('Error during search:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST order - stores in orders collection
app.post('/order', async (req, res) => {
  try {
    const { firstName, lastName, phone, cartItems } = req.body;

    if (!firstName || !lastName || !phone || !cartItems) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Checks if phone is in correct format
    if (!/^\d{3}-\d{2}-\d{3}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone format. Expected format: 000-00-000" });
    }

    // Save order in database
    await db.collection('orders').insertOne({
      firstName,
      lastName,
      phone,
      cartItems,     
      createdAt: new Date()
    });

    // Reduce spaces per lesson based on qty
    for (let item of cartItems) {
      await db.collection('lessons').updateOne(
        { id: item.id },
        { $inc: { spaces: -item.qty } }
      );
    }

    res.json({ message: "Order submitted successfully" });

  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ error: "Failed to process order" });
  }
});

// PUT lessons - update lesson details based on id 
app.put('/lessons/:id', async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const updates = req.body;

    // No updated fields in req body
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    // Validation - spaces and price must be non-negative
    if (updates.spaces !== undefined && updates.spaces < 0) {
      return res.status(400).json({ error: "Spaces cannot be negative" });
    }

    if (updates.price !== undefined && updates.price < 0) {
      return res.status(400).json({ error: "Price cannot be negative" });
    }

    const result = await db.collection('lessons').updateOne(
      { id: lessonId },
      { $set: updates }
    );

    // No lesson matched by id
    if (result.matchedCount === 0) { 
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json({ message: "Lesson updated successfully", updatedFields: updates });

  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: "Failed to update the lesson" });
  }
});

// Start Server
async function StartServer() {
  try {
    await ConnectMongoDB();
    app.listen(port, () => {
      console.log("Server running on port " + port);
    });
  } catch (err) {
    console.error("Startup error:", err);
  }
}

StartServer();
