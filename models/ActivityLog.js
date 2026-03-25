import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  // User who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Target being interacted with
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel',
    required: true,
    index: true
  },
  
  targetModel: {
    type: String,
    enum: ['Task', 'Provider', 'User'],
    required: true
  },
  
  // Type of action
  actionType: {
    type: String,
    enum: ['call', 'whatsapp', 'email', 'view'],
    required: true,
    index: true
  },
  
  // Type of target (worker or job)
  targetType: {
    type: String,
    enum: ['worker', 'job', 'profile'],
    required: true,
    index: true
  },
  
  // Metadata about the interaction
  metadata: {
    phoneNumber: String,
    emailAddress: String,
    whatsappNumber: String,
    contactMethod: String,
    ipAddress: String,
    userAgent: String,
    deviceInfo: String,
    // ✅ Add these fields for job details
    jobTitle: String,
    jobCategory: [String],
    providerName: String,
    providerCategory: [String],
    viewerName: String,      // ✅ Added for profile views
    viewerEmail: String,     // ✅ Added for profile views
  },
  
  // Timestamp of the action
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ targetId: 1, targetModel: 1 });
activityLogSchema.index({ actionType: 1, timestamp: -1 });
activityLogSchema.index({ targetType: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });

// Add TTL index to auto-delete old logs (after 90 days)
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;