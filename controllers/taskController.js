// controllers/taskController.js
import Task from "../models/Task.js"; // Remove the dynamic import and use this directly

/**
 * Update task promotion settings
 */
export const updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const { promoteOn } = req.body;

    console.log('📝 Updating promotion for task:', id);
    console.log('📦 Promotion data:', promoteOn);

    // Validate input
    if (!promoteOn) {
      return res.status(400).json({
        success: false,
        message: 'No promotion data provided'
      });
    }

    const task = await Task.findById(id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    console.log('✅ Task found:', task.title);
    console.log('📊 Current promoteOn:', task.promoteOn);

    // Update promotion settings
    task.promoteOn = {
      homeScreen: promoteOn.homeScreen || false,
      jobsScreen: promoteOn.jobsScreen || false,
      workersScreen: promoteOn.workersScreen || false,
      dashboard: promoteOn.dashboard || false,
      profile: promoteOn.profile || false,
      categories: promoteOn.categories || [],
      regions: promoteOn.regions || [],
      customScreens: promoteOn.customScreens || []
    };
    task.updatedAt = Date.now();

    await task.save();
    console.log('✅ Updated promoteOn:', task.promoteOn);

    res.json({
      success: true,
      message: 'Promotion settings updated successfully',
      task: {
        _id: task._id,
        title: task.title,
        promoteOn: task.promoteOn
      }
    });

  } catch (error) {
    console.error('❌ Error updating promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// ... rest of your controller functions (bulkPromote, getFeaturedTasks) 
// but remove the dynamic imports and use the imported Task model directly

/**
 * Bulk update task promotion settings
 */
export const bulkPromote = async (req, res) => {
  try {
    const { ids, promoteOn } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No task IDs provided'
      });
    }

    import('../models/Task.js').then(async ({ default: Task }) => {
      // Update all tasks
      const result = await Task.updateMany(
        { _id: { $in: ids } },
        {
          $set: {
            'promoteOn.homeScreen': promoteOn?.homeScreen || false,
            'promoteOn.jobsScreen': promoteOn?.jobsScreen || false,
            'promoteOn.workersScreen': promoteOn?.workersScreen || false,
            'promoteOn.dashboard': promoteOn?.dashboard || false,
            'promoteOn.profile': promoteOn?.profile || false,
            'promoteOn.categories': promoteOn?.categories || [],
            'promoteOn.regions': promoteOn?.regions || [],
            'promoteOn.customScreens': promoteOn?.customScreens || [],
            updatedAt: Date.now()
          }
        }
      );

      res.json({
        success: true,
        message: `Updated ${result.modifiedCount} tasks`,
        modifiedCount: result.modifiedCount
      });
    }).catch(error => {
      console.error('Error importing Task model:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });

  } catch (error) {
    console.error('Error in bulk promote:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get featured tasks for a specific screen (PUBLIC)
 */
export const getFeaturedTasks = async (req, res) => {
  try {
    const { screen } = req.params;
    const { category, region, limit = 10 } = req.query;

    import('../models/Task.js').then(async ({ default: Task }) => {
      // Build query based on screen
      let query = { status: 'open' }; // Only show open tasks

      // Handle different screen types
      switch (screen) {
        case 'home':
          query['promoteOn.homeScreen'] = true;
          break;
        case 'jobs':
          query['promoteOn.jobsScreen'] = true;
          break;
        case 'workers':
          query['promoteOn.workersScreen'] = true;
          break;
        case 'dashboard':
          query['promoteOn.dashboard'] = true;
          break;
        case 'profile':
          query['promoteOn.profile'] = true;
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid screen type'
          });
      }

      // Add category filter if provided
      if (category && category !== 'all' && category !== 'undefined') {
        query.category = category;
      }

      // Add region filter if provided
      if (region && region !== 'all' && region !== 'undefined') {
        query.location = { $regex: new RegExp(region, 'i') };
      }

      console.log('Featured tasks query:', JSON.stringify(query));

      // Get featured tasks
      const tasks = await Task.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('clientId', 'email firstName surname');

      res.json({
        success: true,
        screen,
        count: tasks.length,
        tasks
      });
    }).catch(error => {
      console.error('Error importing Task model:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });

  } catch (error) {
    console.error('Error fetching featured tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
