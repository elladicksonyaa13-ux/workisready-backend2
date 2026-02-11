import mongoose from "mongoose";

// Featured Services Schema (Paid listings)
const FeaturedServiceSchema = new mongoose.Schema({
  serviceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Service',
    required: true 
  },
  providerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Provider',
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  order: { 
    type: Number, 
    default: 0 
  },
  isPaid: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Urgent Work Requests (Paid urgent tasks)
const UrgentWorkSchema = new mongoose.Schema({
  taskId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Task',
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  order: { 
    type: Number, 
    default: 0 
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Admin-curated Popular Jobs
const PopularJobSchema = new mongoose.Schema({
  taskId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Task',
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  order: { 
    type: Number, 
    default: 0 
  },
  reason: {
    type: String,
    enum: ['trending', 'high_budget', 'quick_completion', 'admin_choice'],
    default: 'admin_choice'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Popular Cities (Auto-calculated or admin-curated)
const PopularCitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  order: { 
    type: Number, 
    default: 0 
  },
  isAutoCalculated: {
    type: Boolean,
    default: false
  },
  manualJobCount: Number,
  manualCategories: Map,
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Jobs by Region (Should have all 16 regions)
const JobsByRegionSchema = new mongoose.Schema({
  region: {
    type: String,
    required: true,
    enum: [
      'Ashanti', 'Brong-Ahafo', 'Central', 'Eastern', 'Greater Accra',
      'Northern', 'Upper East', 'Upper West', 'Volta', 'Western',
      'Western North', 'Oti', 'Ahafo', 'Bono', 'Bono East', 'Savannah'
    ]
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  order: { 
    type: Number, 
    default: 0 
  },
  isAutoCalculated: {
    type: Boolean,
    default: true
  },
  manualJobCount: Number,
  manualCategories: Map,
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Create models
const FeaturedService = mongoose.model('FeaturedProviders', FeaturedServiceSchema);
const UrgentWork = mongoose.model('UrgentWork', UrgentWorkSchema);
const PopularJob = mongoose.model('PopularJob', PopularJobSchema);
const PopularCity = mongoose.model('PopularCity', PopularCitySchema);
const JobsByRegion = mongoose.model('JobsByRegion', JobsByRegionSchema);

export {
  FeaturedService,
  UrgentWork,
  PopularJob,
  PopularCity,
  JobsByRegion
};