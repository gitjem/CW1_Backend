const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require("fs");

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../CW1_Full_Stack_Development')));

app.use(function(req, res, next){
    var filePath = path.join(__dirname, "static", req.url);
    fs.stat(filePath, function(err, fileInfo){
        if(err){
            next();
            return;
        }

        if (fileInfo.isFile()){
            res.sendFile(filePath);
        } else {
            next();
        }
    });
});

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

// Connect and start server
startServer();

