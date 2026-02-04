import mongoose from "mongoose";
import { allServices } from "../data/categories.js";

// Helper function to enforce max 5 categories
function arrayLimit(val) {
  return val.length <= 5;
}

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: [{
    type: String,
    required: true
  }],
  description: {
    type: String,
    required: true,
    trim: true
  },
  // New fields for better organization
  city: {
    type: String,
    default: ""
  },
  region: {
    type: String,
    default: ""
  },
  district: {
    type: string,
    default: ""
  },
  // Keep for backward compatibility
  location: {
    type: String,
    default: ""
  },
  dueDate: {
    type: Date,
    required: true
  },
  budget: {
    min: {
      type: Number,
      default: 0
    },
    max: {
      type: Number,
      default: 0
    }
  },
  contact: {
    phone: {
      type: String,
      required: true
    },
    whatsapp: {  // New field
      type: String,
      default: ""
    },
    additionalContact: {
      type: String,
      default: ""
    }
  },
  images: [{
    type: String,
    default: []
  }],
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['open', 'completed'],
    default: 'open'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add index for better search
taskSchema.index({ title: 'text', description: 'text', category: 'text', location: 'text' });

// Indexes for better query performance
taskSchema.index({ clientId: 1, createdAt: -1 });
taskSchema.index({ category: 1, status: 1 });
taskSchema.index({ location: 'text', title: 'text', description: 'text' });

export default mongoose.model('Task', taskSchema);
