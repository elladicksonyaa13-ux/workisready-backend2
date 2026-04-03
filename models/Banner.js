import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, required: true },
  mobileImageUrl: { type: String, default: '' },
  tabletImageUrl: { type: String, default: '' },
  linkUrl: { type: String, default: '' },
  
  screens: {
    homeScreen: { type: Boolean, default: false },
    jobsScreen: { type: Boolean, default: false },
    workersScreen: { type: Boolean, default: false },
    dashboard: { type: Boolean, default: false },
    profile: { type: Boolean, default: false },
    categoryPages: [{ type: String }],
    customScreens: [{ type: String }]
  },
  
  schedule: {
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'custom'], default: 'none' },
    intervalMinutes: { type: Number, default: 30 },
    timeSlots: [{
      startTime: String,
      endTime: String
    }]
  },
  
  targeting: {
    regions: [{ type: String }],
    userTypes: [{ type: String, enum: ['client', 'worker'] }],
    categories: [{ type: String }],
    deviceTypes: [{ type: String, enum: ['mobile', 'tablet', 'desktop'] }]
  },
  
  priority: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  
  clicks: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  clickRate: { type: Number, default: 0 },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  
}, { timestamps: true });

// Indexes
bannerSchema.index({ isActive: 1, priority: -1 });
bannerSchema.index({ 'screens.homeScreen': 1 });
bannerSchema.index({ 'screens.jobsScreen': 1 });
bannerSchema.index({ 'screens.workersScreen': 1 });

// Update click rate when clicks/impressions change
bannerSchema.pre('save', function(next) {
  if (this.impressions > 0) {
    this.clickRate = (this.clicks / this.impressions) * 100;
  }
  next();
});

export default mongoose.model('Banner', bannerSchema);