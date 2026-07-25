const mongoose = require('mongoose');

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/academy_management';
  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

module.exports = { connectDatabase };
