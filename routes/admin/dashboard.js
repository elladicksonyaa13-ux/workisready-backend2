import express from "express";
import User from "../../models/User.js";
import Task from "../../models/Task.js";
import Provider from "../../models/Providers.js";
import { adminAuth } from "../../middleware/auth.js";

const router = express.Router();

// Helper function to get monthly counts
const getMonthlyCounts = async (model, dateField = 'createdAt', months = 3) => {
  const today = new Date();
  const monthlyData = [];
  
  for (let i = months - 1; i >= 0; i--) {
    const month = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthName = month.toLocaleString('default', { month: 'short' });
    
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    
    const count = await model.countDocuments({
      [dateField]: { $gte: startOfMonth, $lte: endOfMonth }
    });
    
    monthlyData.push({ month: monthName, count });
  }
  
  return monthlyData;
};

// Calculate growth percentage
const calculateGrowth = (monthlyData) => {
  if (monthlyData.length < 2) return 0;
  const current = monthlyData[monthlyData.length - 1].count;
  const previous = monthlyData[monthlyData.length - 2].count;
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

// ========================
// GET DASHBOARD STATS
// ========================
router.get("/", adminAuth, async (req, res) => {
  try {
    console.log("Fetching dashboard stats by admin:", req.admin.email);

    // 1. Users stats
    const userMonthly = await getMonthlyCounts(User);
    const userGrowth = calculateGrowth(userMonthly);
    const totalUsers = await User.countDocuments();

    // 2. Jobs stats
    const jobMonthly = await getMonthlyCounts(Task);
    const jobGrowth = calculateGrowth(jobMonthly);
    const totalJobs = await Task.countDocuments();

    // 3. Workers stats
    const workerMonthly = await getMonthlyCounts(Provider);
    const workerGrowth = calculateGrowth(workerMonthly);
    const totalWorkers = await Provider.countDocuments();

    // 4. Workers by category
    const allProviders = await Provider.find().select('category');
    const categoryCount = {};
    allProviders.forEach(provider => {
      if (provider.category && Array.isArray(provider.category)) {
        provider.category.forEach(cat => {
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });
      }
    });
    
    const workersByCategory = Object.entries(categoryCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 categories

    // 5. Jobs by region
    const jobsByRegion = await Task.aggregate([
      { $match: { region: { $exists: true, $ne: "" } } },
      { $group: { _id: "$region", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // 6. Workers by region
    const workersByRegion = await Provider.aggregate([
      { $match: { region: { $exists: true, $ne: "" } } },
      { $group: { _id: "$region", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // 7. Top skilled workers
    const topWorkers = await Provider.find()
      .sort({ averageRating: -1, createdAt: -1 })
      .limit(10)
      .select('firstName surname category skills averageRating profilePic');

    const formattedTopWorkers = topWorkers.map(w => ({
      name: `${w.firstName} ${w.surname}`,
      category: w.category?.[0] || 'General',
      jobs: Math.floor(Math.random() * 50) + 10, // Placeholder - replace with actual job count
      rating: w.averageRating || 4.5,
      image: w.profilePic
    }));

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          growth: userGrowth,
          monthly: userMonthly
        },
        jobs: {
          total: totalJobs,
          growth: jobGrowth,
          monthly: jobMonthly
        },
        workers: {
          total: totalWorkers,
          growth: workerGrowth,
          monthly: workerMonthly,
          byCategory: workersByCategory
        },
        jobsByRegion: jobsByRegion.map(j => ({ region: j._id, count: j.count })),
        workersByRegion: workersByRegion.map(w => ({ region: w._id, count: w.count })),
        topWorkers: formattedTopWorkers
      }
    });

  } catch (error) {
    console.error("❌ Error fetching dashboard stats:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while fetching dashboard stats" 
    });
  }
});

export default router;