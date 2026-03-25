// models/Notification.js
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  // Recipient
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userType: {
    type: String,
    enum: ['worker', 'client'],
    required: true
  },

  // Notification content
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['job', 'worker'],
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Related data
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['Task', 'User']
  },
  
  // UI data
  color: {
    type: String,
    default: function() {
      return this.type === 'job' ? 'green' : 'blue';
    }
  },
  
  // Status
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Expiry
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
    index: true
  }
}, {
  timestamps: true
});

// Index for cleanup
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ userId: 1, type: 1, relatedId: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);