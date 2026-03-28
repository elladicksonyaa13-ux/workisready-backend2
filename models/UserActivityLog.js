import mongoose from 'mongoose';

const userActivityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userName: {
    type: String,
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userType: {
    type: String,
    enum: ['client', 'worker'],
    default: 'client'
  },
  action: {
    type: String,
    enum: [
      'DELETE_ACCOUNT',
      'REQUEST_DELETION',
      'SUSPEND_ACCOUNT',
      'UNSUSPEND_ACCOUNT',
      'REPORT_ABUSE',
      'CONTACT_SUPPORT'
    ],
    required: true,
    index: true
  },
  details: {
    reason: String,
    jobsSuspended: Number,
    workerProfilesSuspended: Number,
    scheduledDeletionDate: Date,
    reportType: String,
    reportDescription: String,
    supportMessage: String,
    ipAddress: String,
    userAgent: String,
    additionalInfo: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes
userActivityLogSchema.index({ userId: 1, timestamp: -1 });
userActivityLogSchema.index({ action: 1, timestamp: -1 });
userActivityLogSchema.index({ timestamp: -1 });

// TTL index - auto delete after 90 days
userActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const UserActivityLog = mongoose.model('UserActivityLog', userActivityLogSchema);

export default UserActivityLog;