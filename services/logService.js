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

        shareMethod: metadata.shareMethod, // ✅ Add share method
        
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

// In logService.js - getLogs function

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
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.timestamp.$lte = endDateTime;
      }
    }
    
    // ✅ ENHANCED: Search by user name, email, OR target name
    if (search && search.trim()) {
      const searchTerm = search.trim();
      const searchRegex = { $regex: searchTerm, $options: 'i' };
      
      // 1. Find users matching the search
      const users = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex }
        ]
      }).select('_id');
      
      const userIds = users.map(u => u._id);
      
      // 2. Find targets (jobs/workers) matching the search
      let targetIds = [];
      
      if (targetType === 'worker' || !targetType || targetType === 'all') {
        // Search in workers
        const workers = await Provider.find({
          $or: [
            { businessName: searchRegex },
            { firstName: searchRegex },
            { surname: searchRegex },
            { fullName: searchRegex }
          ]
        }).select('_id');
        targetIds.push(...workers.map(w => w._id));
      }
      
      if (targetType === 'job' || !targetType || targetType === 'all') {
        // Search in jobs
        const jobs = await Task.find({
          title: searchRegex
        }).select('_id');
        targetIds.push(...jobs.map(j => j._id));
      }
      
      // Remove duplicates
      targetIds = [...new Set(targetIds.map(id => id.toString()))];
      
      // Build the search query with $or
      const searchConditions = [];
      
      if (userIds.length > 0) {
        searchConditions.push({ userId: { $in: userIds } });
      }
      
      if (targetIds.length > 0) {
        searchConditions.push({ targetId: { $in: targetIds } });
      }
      
      // Also search in metadata (phone numbers, emails)
      searchConditions.push({
        $or: [
          { 'metadata.phoneNumber': searchRegex },
          { 'metadata.emailAddress': searchRegex },
          { 'metadata.whatsappNumber': searchRegex },
          { 'metadata.providerName': searchRegex },
          { 'metadata.jobTitle': searchRegex }
        ]
      });
      
      if (searchConditions.length > 0) {
        query.$or = searchConditions;
      } else {
        // If no matches found in any condition, return empty
        return { 
          success: true,
          logs: [], 
          total: 0, 
          stats: { totalCalls: 0, totalWhatsApp: 0, totalEmails: 0, totalShares: 0, uniqueUsers: 0 },
          pagination: { page, limit, total: 0, pages: 0 }
        };
      }
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Create a clean filter for stats
    const statsFilter = query && typeof query === 'object' ? query : {};
    
    // Execute query with population
    const [logs, total, stats] = await Promise.all([
      ActivityLog.find(query)
        .populate('userId', 'name email userType')
        .populate({
          path: 'targetId',
          select: 'title name firstName surname businessName fullName',
        })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query),
      this.calculateStats(statsFilter)
    ]);
    
    // Format the logs for frontend
    const formattedLogs = logs.map(log => ({
      ...log,
      targetId: this.formatTarget(log.targetId, log.targetType, log.targetModel),
      timestamp: log.timestamp
    }));
    
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
    return { 
      success: false, 
      logs: [], 
      total: 0, 
      stats: { totalCalls: 0, totalWhatsApp: 0, totalEmails: 0, totalShares: 0, uniqueUsers: 0 },
      pagination: { page, limit, total: 0, pages: 0 }
    };
  }
}
  
  // ========================
  // CALCULATE STATS
  // ========================
// In logService.js - calculateStats function

async calculateStats(query = {}) {
  try {
    // ✅ FIX: Ensure query is always an object
    let filter = {};
    
    if (query && typeof query === 'object' && !Array.isArray(query)) {
      filter = query;
    }
    
    // If filter is empty, just count all
    const hasFilters = Object.keys(filter).length > 0;
    
    // Get counts for each action type
    const [totalCalls, totalWhatsApp, totalEmails, totalShares, uniqueUsers] = await Promise.all([
      ActivityLog.countDocuments(hasFilters ? { ...filter, actionType: 'call' } : { actionType: 'call' }),
      ActivityLog.countDocuments(hasFilters ? { ...filter, actionType: 'whatsapp' } : { actionType: 'whatsapp' }),
      ActivityLog.countDocuments(hasFilters ? { ...filter, actionType: 'email' } : { actionType: 'email' }),
      ActivityLog.countDocuments(hasFilters ? { ...filter, actionType: 'share' } : { actionType: 'share' }),
      ActivityLog.distinct('userId', hasFilters ? filter : {}).then(users => users.length)
    ]);
    
    return {
      totalCalls,
      totalWhatsApp,
      totalEmails,
      uniqueUsers,
      totalShares, // ✅ Add to return object
    };
  } catch (error) {
    console.error('Error calculating stats:', error);
    // Return default stats instead of throwing
    return {
      totalCalls: 0,
      totalWhatsApp: 0,
      totalEmails: 0,
      uniqueUsers: 0,
      totalShares: 0,
    };
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
    
    // ✅ ENHANCED: Search for export as well
    if (search && search.trim()) {
      const searchTerm = search.trim();
      const searchRegex = { $regex: searchTerm, $options: 'i' };
      
      // Find users
      const users = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex }
        ]
      }).select('_id');
      const userIds = users.map(u => u._id);
      
      // Find targets
      let targetIds = [];
      if (targetType === 'worker' || !targetType || targetType === 'all') {
        const workers = await Provider.find({
          $or: [
            { businessName: searchRegex },
            { firstName: searchRegex },
            { surname: searchRegex },
            { fullName: searchRegex }
          ]
        }).select('_id');
        targetIds.push(...workers.map(w => w._id));
      }
      
      if (targetType === 'job' || !targetType || targetType === 'all') {
        const jobs = await Task.find({
          title: searchRegex
        }).select('_id');
        targetIds.push(...jobs.map(j => j._id));
      }
      
      targetIds = [...new Set(targetIds.map(id => id.toString()))];
      
      const searchConditions = [];
      if (userIds.length > 0) searchConditions.push({ userId: { $in: userIds } });
      if (targetIds.length > 0) searchConditions.push({ targetId: { $in: targetIds } });
      searchConditions.push({
        $or: [
          { 'metadata.phoneNumber': searchRegex },
          { 'metadata.emailAddress': searchRegex },
          { 'metadata.whatsappNumber': searchRegex },
          { 'metadata.providerName': searchRegex },
          { 'metadata.jobTitle': searchRegex }
        ]
      });
      
      if (searchConditions.length > 0) {
        query.$or = searchConditions;
      } else {
        return [];
      }
    }
    
    const logs = await ActivityLog.find(query)
      .populate('userId', 'name email userType')
      .populate({
        path: 'targetId',
        select: 'title name firstName surname businessName',
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
      case 'share': return 'Share';
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
      
      const [totalCalls, totalWhatsApp, totalEmails, totalShares, uniqueUsers] = await Promise.all([
        ActivityLog.countDocuments({ targetId, targetModel, actionType: 'call' }),
        ActivityLog.countDocuments({ targetId, targetModel, actionType: 'whatsapp' }),
        ActivityLog.countDocuments({ targetId, targetModel, actionType: 'email' }),
        ActivityLog.countDocuments({ targetId, targetModel, actionType: 'share' }),
        ActivityLog.distinct('userId', { targetId, targetModel }).then(users => users.length)
      ]);
      
      return {
        totalCalls,
        totalWhatsApp,
        totalEmails,
        uniqueUsers,
        totalShares,
        totalInteractions: totalCalls + totalWhatsApp + totalEmails + totalShares
      };
    } catch (error) {
      console.error('Error fetching target stats:', error);
      return { totalCalls: 0, totalWhatsApp: 0, totalEmails: 0, totalShares: 0, uniqueUsers: 0, totalInteractions: 0 };
    }
  }
}

export default new LogService();