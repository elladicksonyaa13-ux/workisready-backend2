import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Provider from '../models/Providers.js';

class LogService {
  
 async logContactInteraction(userId, targetId, targetType, actionType, metadata = {}) {
  try {
    // Determine the target model
    const targetModel = targetType === 'worker' ? 'Provider' : 'Task';
    
    // Verify target exists
    let targetExists = false;
    if (targetType === 'worker') {
      const provider = await Provider.findById(targetId);
      targetExists = !!provider;
    } else {
      const task = await Task.findById(targetId);
      targetExists = !!task;
    }
    
    if (!targetExists) {
      console.warn(`Target ${targetId} (${targetType}) not found for log`);
      return null;
    }
    
    // Get user agent and IP from request if available
    const userAgent = metadata.userAgent || '';
    const ipAddress = metadata.ipAddress || '';
    
    const log = new ActivityLog({
      userId,
      targetId,
      targetModel,
      actionType,
      targetType,
      metadata: {
        // Contact info
        phoneNumber: metadata.phoneNumber,
        emailAddress: metadata.emailAddress,
        whatsappNumber: metadata.whatsappNumber,
        contactMethod: metadata.contactMethod,
        
        // Request info
        ipAddress,
        userAgent,
        deviceInfo: metadata.deviceInfo,
        
        // Job details (if applicable)
        jobTitle: metadata.jobTitle,
        jobCategory: metadata.jobCategory,
        
        // Provider details (if applicable)
        providerName: metadata.providerName,
        providerCategory: metadata.providerCategory
      },
      timestamp: new Date()
    });
    
    await log.save();
    console.log(`✅ Logged ${actionType} interaction for user ${userId} on ${targetType} ${targetId}`);
    
    return log;
  } catch (error) {
    console.error('Error logging contact interaction:', error);
    return null;
  }
}
  
  // ========================
  // GET LOGS WITH FILTERS
  // ========================
  async getLogs({
    targetType,
    actionType,
    userId,
    targetId,
    startDate,
    endDate,
    search,
    page = 1,
    limit = 20,
    sortBy = 'timestamp',
    sortOrder = 'desc'
  }) {
    try {
      const query = {};
      
      // Filter by target type (worker or job)
      if (targetType && targetType !== 'all') {
        query.targetType = targetType;
      }
      
      // Filter by action type
      if (actionType && actionType !== 'all') {
        query.actionType = actionType;
      }
      
      // Filter by specific user
      if (userId) {
        query.userId = userId;
      }
      
      // Filter by specific target
      if (targetId) {
        query.targetId = targetId;
      }
      
      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          // Set to end of day
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          query.timestamp.$lte = endDateTime;
        }
      }
      
      // Search by user name or email
      if (search && search.trim()) {
        // First find users matching the search
        const users = await User.find({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');
        
        const userIds = users.map(u => u._id);
        
        if (userIds.length > 0) {
          query.userId = { $in: userIds };
        } else {
          // If no users found, return empty result
          return { logs: [], total: 0, stats: this.calculateStats([]) };
        }
      }
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Sort options
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
      
      // Execute query with population
      const [logs, total] = await Promise.all([
        ActivityLog.find(query)
          .populate('userId', 'name email userType')
          .populate({
            path: 'targetId',
            select: 'title name firstName surname businessName',
            // populate: {
            //   path: 'userId',
            //   select: 'name email'
            // }
          })
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        ActivityLog.countDocuments(query)
      ]);
      
      // Format the logs for frontend
      const formattedLogs = logs.map(log => ({
        ...log,
        targetId: this.formatTarget(log.targetId, log.targetType, log.targetModel),
        timestamp: log.timestamp
      }));
      
      // Calculate stats
      const stats = await this.calculateStats(query);
      
      return {
        success: true,
        logs: formattedLogs,
        total,
        stats,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching logs:', error);
      return { success: false, logs: [], total: 0, stats: { totalCalls: 0, totalWhatsApp: 0, totalEmails: 0, uniqueUsers: 0 } };
    }
  }
  
  // ========================
  // CALCULATE STATS
  // ========================
  async calculateStats(query = {}) {
    try {
      const [totalCalls, totalWhatsApp, totalEmails, uniqueUsers] = await Promise.all([
        ActivityLog.countDocuments({ ...query, actionType: 'call' }),
        ActivityLog.countDocuments({ ...query, actionType: 'whatsapp' }),
        ActivityLog.countDocuments({ ...query, actionType: 'email' }),
        ActivityLog.distinct('userId', query).then(users => users.length)
      ]);
      
      return {
        totalCalls,
        totalWhatsApp,
        totalEmails,
        uniqueUsers
      };
    } catch (error) {
      console.error('Error calculating stats:', error);
      return { totalCalls: 0, totalWhatsApp: 0, totalEmails: 0, uniqueUsers: 0 };
    }
  }
  
  // ========================
  // FORMAT TARGET OBJECT
  // ========================
  formatTarget(target, targetType, targetModel) {
    if (!target) return null;
    
    if (targetType === 'worker') {
      return {
        _id: target._id,
        name: target.businessName || `${target.firstName} ${target.surname}`,
        firstName: target.firstName,
        surname: target.surname,
        businessName: target.businessName
      };
    } else {
      return {
        _id: target._id,
        title: target.title,
        // clientName: target.userId?.name,
        // clientEmail: target.userId?.email
      };
    }
  }
  
  // ========================
  // EXPORT LOGS TO CSV
  // ========================
  async exportLogs({
    targetType,
    actionType,
    startDate,
    endDate,
    search
  }) {
    try {
      const query = {};
      
      if (targetType && targetType !== 'all') {
        query.targetType = targetType;
      }
      
      if (actionType && actionType !== 'all') {
        query.actionType = actionType;
      }
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          query.timestamp.$lte = endDateTime;
        }
      }
      
      if (search && search.trim()) {
        const users = await User.find({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');
        
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          query.userId = { $in: userIds };
        } else {
          return [];
        }
      }
      
      const logs = await ActivityLog.find(query)
        .populate('userId', 'name email userType')
        .populate({
          path: 'targetId',
          select: 'title name firstName surname businessName',
        //   populate: {
        //     path: 'userId',
        //     select: 'name email'
        //   }
        })
        .sort({ timestamp: -1 })
        .lean();
      
      return logs.map(log => ({
        'Date': new Date(log.timestamp).toLocaleString(),
        'User Name': log.userId?.name || 'Unknown',
        'User Email': log.userId?.email || 'Unknown',
        'User Type': log.userId?.userType || 'client',
        'Action': this.getActionLabel(log.actionType),
        'Target Type': log.targetType === 'worker' ? 'Worker' : 'Job',
        'Target Name': log.targetType === 'worker' 
          ? (log.targetId?.businessName || `${log.targetId?.firstName} ${log.targetId?.surname}`)
          : log.targetId?.title,
        'Contact Info': log.metadata?.phoneNumber || log.metadata?.emailAddress || log.metadata?.whatsappNumber || '',
        'IP Address': log.metadata?.ipAddress || '',
        'User Agent': log.metadata?.userAgent || ''
      }));
    } catch (error) {
      console.error('Error exporting logs:', error);
      return [];
    }
  }
  
  getActionLabel(actionType) {
    switch (actionType) {
      case 'call': return 'Phone Call';
      case 'whatsapp': return 'WhatsApp Message';
      case 'email': return 'Email';
      default: return actionType;
    }
  }
  
  // ========================
  // GET USER INTERACTION HISTORY
  // ========================
  async getUserInteractionHistory(userId, targetType, limit = 50) {
    try {
      const logs = await ActivityLog.find({ userId, targetType })
        .populate('targetId')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      
      return logs;
    } catch (error) {
      console.error('Error fetching user interaction history:', error);
      return [];
    }
  }
  
  // ========================
  // GET TARGET INTERACTION STATS
  // ========================
  async getTargetStats(targetId, targetType) {
    try {
      const targetModel = targetType === 'worker' ? 'Provider' : 'Task';
      
      const [totalCalls, totalWhatsApp, totalEmails, uniqueUsers] = await Promise.all([
        ActivityLog.countDocuments({ targetId, targetModel, actionType: 'call' }),
        ActivityLog.countDocuments({ targetId, targetModel, actionType: 'whatsapp' }),
        ActivityLog.countDocuments({ targetId, targetModel, actionType: 'email' }),
        ActivityLog.distinct('userId', { targetId, targetModel }).then(users => users.length)
      ]);
      
      return {
        totalCalls,
        totalWhatsApp,
        totalEmails,
        uniqueUsers,
        totalInteractions: totalCalls + totalWhatsApp + totalEmails
      };
    } catch (error) {
      console.error('Error fetching target stats:', error);
      return { totalCalls: 0, totalWhatsApp: 0, totalEmails: 0, uniqueUsers: 0, totalInteractions: 0 };
    }
  }
}

export default new LogService();