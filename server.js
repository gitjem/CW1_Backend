const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require("fs");

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../CW1_Full_Stack_Development')));

// app.use(function(req, res, next){
//     var filePath = path.join(__dirname, "static", req.url);
//     fs.stat(filePath, function(err, fileInfo){
//         if(err){
//             next();
//             return;
//         }

//         if (fileInfo.isFile()){
//             res.sendFile(filePath);
//         } else {
//             next();
//         }
//     });
// });

// MongoDB connection
require('dotenv').config(); // load mongodb url from .env
const url = process.env.MONGO_URL;

const client = new MongoClient(url);
let db;

async function startServer() {
  try {
    await client.connect();
    db = client.db('afterSchoolDB'); 
    console.log('Connected to MongoDB');

    // Start the server
    app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
  }
}


// Routes 
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../CW1_Full_Stack_Development/frontend/index.html'));
});

app.get('/lessons', async (req, res) => {
  try {
    const allLessons = await db.collection('lessons').find({}).toArray();
    res.json(allLessons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});


app.get('/search', async (req, res) => {
  try {
    const query = req.query.query?.toLowerCase() || '';

    // If search box is empty, show all lessons
    if (query === '') {
      const allLessons = await db.collection('lessons').find({}).toArray();
      return res.json(allLessons);
    }

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

app.post('/order', async (req, res) => {
  try {
    const { firstName, lastName, phone, cartItems } = req.body;

    if (!firstName || !lastName || !phone || !cartItems) {
      return res.status(400).json({ error: "Missing required fields" });
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

// Connect and start server
startServer();

