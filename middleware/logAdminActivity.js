import AdminLog from '../models/AdminLog.js';

export const logAdminActivity = async (req, res, next) => {
  // Store the original json method
  const originalJson = res.json;
  
  // Store original send method for non-JSON responses
  const originalSend = res.send;
  
  // Override json method
  res.json = function(data) {
    // Store the response data to check success
    res.locals.responseData = data;
    return originalJson.call(this, data);
  };
  
  // Override send method for non-JSON responses
  res.send = function(data) {
    res.locals.responseData = data;
    return originalSend.call(this, data);
  };
  
  next();
};

// Helper function to create log entry
export const createAdminLog = async ({
  req,
  action,
  entityType,
  entityId = null,
  entityModel = null,
  entityName = null,
  details = {}
}) => {
  try {
    // Only log if admin is authenticated, but allow for failed login attempts
    if (!req.admin && action !== 'LOGIN_FAILED') {
      return;
    }
    
    // Get IP address - handle missing properties
    let ipAddress = null;
    if (req) {
      ipAddress = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || null;
      if (Array.isArray(ipAddress)) {
        ipAddress = ipAddress[0];
      }
    }
    
    // Get user agent - handle missing properties
    const userAgent = req?.headers?.['user-agent'] || null;
    
    const logData = {
      action,
      entityType,
      entityId,
      entityModel,
      entityName,
      details,
      ipAddress,
      userAgent,
      timestamp: new Date()
    };
    
    // Only add admin fields if admin exists
    if (req.admin) {
      logData.adminId = req.admin._id;
      logData.adminName = req.admin.name;
      logData.adminEmail = req.admin.email;
      logData.adminRole = req.admin.role;
    } else if (action === 'LOGIN_FAILED') {
      // For failed login attempts, we can't link to an admin
      logData.adminId = null;
      logData.adminName = 'Unknown';
      logData.adminEmail = details.email || 'Unknown';
      logData.adminRole = null;
    }
    
    await AdminLog.create(logData);
    
    console.log(`✅ Admin log created: ${action} by ${req.admin.email}`);
  } catch (error) {
    console.error('❌ Error creating admin log:', error);
  }
};