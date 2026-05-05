import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  description: { type: String, trim: true },
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 1 },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'AVAILABLE', 'REJECTED', 'CLAIMED', 'EXPIRED'], 
    default: 'PENDING' 
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requestedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Medicine', medicineSchema);
