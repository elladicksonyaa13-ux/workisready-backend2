import mongoose from 'mongoose';

const adminLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  adminName: {
    type: String,
    required: true
  },
  adminEmail: {
    type: String,
    required: true
  },
  adminRole: {
    type: String,
    enum: ['superadmin', 'subadmin', 'supersubadmin'],
    required: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  entityType: {
    type: String,
    enum: ['user', 'job', 'worker', 'admin', 'log', 'notification'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'entityModel',
    default: null
  },
  entityModel: {
    type: String,
    default: null
  },
  entityName: {
    type: String,
    default: null
  },
  details: {
  type: mongoose.Schema.Types.Mixed,  // ← simplest fix
  default: {}
},
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
adminLogSchema.index({ timestamp: -1 });
adminLogSchema.index({ adminId: 1, timestamp: -1 });
adminLogSchema.index({ action: 1, timestamp: -1 });
adminLogSchema.index({ entityType: 1, timestamp: -1 });

// TTL index - auto delete logs after 90 days
adminLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const AdminLog = mongoose.model('AdminLog', adminLogSchema);

export default AdminLog;