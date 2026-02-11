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
   mainCategory: {
    type: String,
    required: true,  // Make this required for new jobs
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
    type: String,
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
  completedAt: {
      type: Date,
      default: null,
    },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add index for better search
taskSchema.index({ title: 'text', description: 'text', mainCategory: 'text', category: 'text', location: 'text', region: 'text' });

// Indexes for better query performance
taskSchema.index({ clientId: 1, createdAt: -1 });
taskSchema.index({ region: 1, mainCategory: 1, status: 1});
taskSchema.index({ category: 1, status: 1 });
taskSchema.index({ location: 'text', title: 'text', description: 'text' });
taskSchema.index({ region: 1, status: 1 });

taskSchema.pre('save', function(next) {
  // If mainCategory is not set but category array has values, use the first one
  if (!this.mainCategory && this.category && this.category.length > 0) {
    this.mainCategory = this.category[0];
  }
  next();
});

export default mongoose.model('Task', taskSchema);
