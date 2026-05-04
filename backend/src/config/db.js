import mongoose from 'mongoose';

const connectDB = async () => {
  console.log("Using MongoDB URI:", process.env.MONGODB_URI ? "Loaded" : "Missing");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in environment');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

export default connectDB;


