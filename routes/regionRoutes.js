import express from "express";
import mongoose from "mongoose";

const router = express.Router();

router.get("/jobs-by-region", async (req, res) => {
  try {
    console.log("🔄 Fetching real jobs by region...");
    
    // Define all 16 Ghana regions in alphabetical order
    const allGhanaRegions = [
      'Ahafo', 'Ashanti', 'Bono', 'Bono East', 
      'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 
      'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 
      'Western North'
    ];
    
    // Try to get the Task model
    let Task;
    try {
      Task = mongoose.model('Task');
    } catch (err) {
      console.log("⚠️ Task model not found, trying 'Job'...");
      try {
        Task = mongoose.model('Job');
      } catch (err2) {
        console.log("⚠️ Job model not found either");
        return res.json({
          success: true,
          regions: allGhanaRegions.map(region => ({
            _id: region,
            name: region,
            totalJobs: 0,
            categories: {}
          })),
          totalJobs: 0,
          message: "No task/job model found"
        });
      }
    }
    
    // Get ALL open jobs
    const jobs = await Task.find({ 
      status: "open"
    }).select("region category mainCategory");
    
    console.log(`✅ Found ${jobs.length} open jobs total`);
    
    // Group by region manually
    const regionMap = {};
    
    // Initialize all regions with 0 jobs
    allGhanaRegions.forEach(region => {
      regionMap[region] = {
        totalJobs: 0,
        categories: {}
      };
    });
    
    // Add "Unspecified Region" for jobs without regions
    regionMap["Unspecified Region"] = {
      totalJobs: 0,
      categories: {}
    };
    
    // Track excluded jobs for logging
    let excludedJobs = 0;
    
    // Count jobs by region and category
    jobs.forEach(job => {
      const region = job.region;
      const category = job.category;
      const mainCategory = job.mainCategory;
      
      // EXCLUDE if mainCategory is "Popular Jobs" or "Popular Workers"
      if (mainCategory === "Popular Jobs" || mainCategory === "Popular Workers") {
        excludedJobs++;
        return; // Skip this job entirely
      }
      
      let targetRegion = "Unspecified Region";
      
      if (region && region.trim()) {
        // Try to match region name
        const normalizedRegion = region.trim();
        
        // Check if region exists in our list
        const matchingRegion = allGhanaRegions.find(r => 
          r.toLowerCase() === normalizedRegion.toLowerCase() 
        );
        
        if (matchingRegion) {
          targetRegion = matchingRegion;
        }
      }
      
      // Count the job
      regionMap[targetRegion].totalJobs++;
      
      // Count categories if they exist
      if (category) {
        // Handle both string and array categories
        if (Array.isArray(category)) {
          category.forEach(cat => {
            if (cat && cat.trim()) {
              regionMap[targetRegion].categories[cat] = 
                (regionMap[targetRegion].categories[cat] || 0) + 1;
            }
          });
        } else if (typeof category === 'string') {
          // Split comma-separated categories
          const categories = category.split(',').map(c => c.trim()).filter(c => c);
          categories.forEach(cat => {
            regionMap[targetRegion].categories[cat] = 
              (regionMap[targetRegion].categories[cat] || 0) + 1;
          });
        }
      }
    });
    
    // Convert to array format - NO SORTING BY JOB COUNT
    const regionsArray = [
      // Unspecified Region first (if it has jobs)
      ...(regionMap["Unspecified Region"].totalJobs > 0 ? [{
        _id: "unspecified",
        name: "Unspecified Region",
        totalJobs: regionMap["Unspecified Region"].totalJobs,
        categories: regionMap["Unspecified Region"].categories,
        hasJobs: true,
        isUnspecified: true
      }] : []),
      
      // Then all Ghana regions in ALPHABETICAL ORDER (as defined in allGhanaRegions)
      ...allGhanaRegions.map(regionName => ({
        _id: regionName,
        name: regionName,
        totalJobs: regionMap[regionName].totalJobs,
        categories: regionMap[regionName].categories,
        hasJobs: regionMap[regionName].totalJobs > 0,
        isUnspecified: false
      }))
    ];
    
    // ✅ NO SORTING BY JOB COUNT - Keep alphabetical order
    const totalJobs = regionsArray.reduce((sum, region) => sum + region.totalJobs, 0);
    
    console.log(`✅ Returning ${regionsArray.length} regions with ${totalJobs} total jobs`);
    console.log(`✅ Excluded ${excludedJobs} jobs with mainCategory: "Popular Jobs" or "Popular Workers"`);
    
    res.json({
      success: true,
      regions: regionsArray,
      totalJobs: totalJobs,
      totalOpenJobs: jobs.length,
      excludedJobs: excludedJobs,
      jobsWithRegions: jobs.filter(j => j.region && j.region.trim()).length,
      jobsWithoutRegions: jobs.filter(j => !j.region || !j.region.trim()).length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Error in jobs-by-region:", error);
    
    // Return empty but valid response
    res.json({
      success: true,
      regions: [],
      totalJobs: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add this debug route
router.get("/debug-jobs", async (req, res) => {
  try {
    const Task = mongoose.model('Task');
    
    // Get ALL jobs (not just open)
    const allJobs = await Task.find({}).select("title region category status");
    
    // Get open jobs
    const openJobs = await Task.find({ status: "open" }).select("title region category");
    
    res.json({
      totalJobs: allJobs.length,
      openJobs: openJobs.length,
      openJobsWithRegion: openJobs.filter(job => job.region).length,
      openJobsWithoutRegion: openJobs.filter(job => !job.region).length,
      
      // Sample of jobs with regions
      jobsWithRegions: openJobs
        .filter(job => job.region)
        .slice(0, 10)
        .map(job => ({
          title: job.title,
          region: job.region,
          category: job.category,
          status: job.status
        })),
      
      // Sample of jobs without regions
      jobsWithoutRegions: openJobs
        .filter(job => !job.region)
        .slice(0, 10)
        .map(job => ({
          title: job.title,
          region: job.region,
          category: job.category,
          status: job.status
        })),
      
      // All unique regions found
      allRegionsFound: [...new Set(openJobs.map(job => job.region).filter(Boolean))],
      
      // Count by region
      regionCounts: openJobs.reduce((acc, job) => {
        if (job.region) {
          acc[job.region] = (acc[job.region] || 0) + 1;
        }
        return acc;
      }, {})
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

export default router;