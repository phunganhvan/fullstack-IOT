const mongoose = require('mongoose');

let mongoConnected = false;

async function connectMongo() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn('MongoDB is not configured (MONGODB_URI is empty). Running with in-memory store only.');
    mongoConnected = false;
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB_NAME || undefined,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4,
    });

    mongoConnected = true;
    console.log('MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB error:', err.message);
      mongoConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      mongoConnected = false;
    });

    mongoose.connection.on('connected', () => {
      mongoConnected = true;
    });
  } catch (error) {
    mongoConnected = false;
    console.error('MongoDB connection failed:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
    console.warn('Continuing with in-memory store only.');
  }
}

function isMongoConnected() {
  return mongoConnected;
}

module.exports = {
  connectMongo,
  isMongoConnected,
};
