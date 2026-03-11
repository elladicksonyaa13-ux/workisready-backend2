import Provider from "../models/Providers.js";
import fs from "fs";

// ✅ Get provider by userId
export const getProviderByUserId = async (req, res) => {
  try {
    const provider = await Provider.findOne({ userId: req.user._id });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found.",
      });
    }

    res.json({ success: true, provider });
  } catch (error) {
    console.error("❌ Error fetching provider:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching provider information.",
    });
  }
};

// ✅ Update provider (UPDATED LOGIC)
export const updateProvider = async (req, res) => {
  try {
    const userId = req.user._id;
    const provider = await Provider.findOne({ userId });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found.",
      });
    }

    const {
      firstName,
      surname,
      city,
      region,
      district,
      category,
      bio,
      skills,
    } = req.body;

    // ✅ Replace selfie
    if (req.files?.profilePic?.[0]) {
      if (provider.profilePic && fs.existsSync(provider.profilePic)) {
        fs.unlinkSync(provider.profilePic);
      }
      provider.profilePic = req.files.profilePic[0].path;
    }

    // ✅ Append sample work (max 5 handled on frontend)
    if (req.files?.sampleWork?.length) {
      provider.sampleWork = [
        ...provider.sampleWork,
        ...req.files.sampleWork.map((f) => f.path),
      ];
    }

    // ✅ Update text fields
    provider.firstName = firstName ?? provider.firstName;
    provider.surname = surname ?? provider.surname;
    provider.city = city ?? provider.city;
    provider.region = region ?? provider.region;
    provider.district = district ?? provider.district;
    provider.bio = bio ?? provider.bio;

    if (category) provider.category = JSON.parse(category);
    if (skills) provider.skills = JSON.parse(skills);

    await provider.save();

    res.json({
      success: true,
      message: "Provider profile updated successfully!",
      provider,
    });
  } catch (error) {
    console.error("❌ Error updating provider:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// Add these functions to your existing providerController.js

/**
 * Update provider promotion settings
 */
export const updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const { promoteOn } = req.body;

    console.log('Updating promotion for provider:', id);
    console.log('Promotion data:', promoteOn);

    // Validate input
    if (!promoteOn) {
      return res.status(400).json({
        success: false,
        message: 'No promotion data provided'
      });
    }

    // Import Provider model
    import('../models/Providers.js').then(async ({ default: Provider }) => {
      const provider = await Provider.findById(id);
      
      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Provider not found'
        });
      }

      // Update promotion settings
      provider.promoteOn = {
        homeScreen: promoteOn.homeScreen || false,
        jobsScreen: promoteOn.jobsScreen || false,
        workersScreen: promoteOn.workersScreen || false,
        dashboard: promoteOn.dashboard || false,
        profile: promoteOn.profile || false,
        categories: promoteOn.categories || [],
        regions: promoteOn.regions || [],
        customScreens: promoteOn.customScreens || []
      };
      provider.updatedAt = Date.now();

      await provider.save();

      res.json({
        success: true,
        message: 'Promotion settings updated successfully',
        provider: {
          _id: provider._id,
          firstName: provider.firstName,
          surname: provider.surname,
          promoteOn: provider.promoteOn
        }
      });
    }).catch(error => {
      console.error('Error importing Provider model:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });

  } catch (error) {
    console.error('Error updating promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Bulk update promotion settings
 */
export const bulkPromote = async (req, res) => {
  try {
    const { ids, promoteOn } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No provider IDs provided'
      });
    }

    import('../models/Providers.js').then(async ({ default: Provider }) => {
      // Update all providers
      const result = await Provider.updateMany(
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
        message: `Updated ${result.modifiedCount} providers`,
        modifiedCount: result.modifiedCount
      });
    }).catch(error => {
      console.error('Error importing Provider model:', error);
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
 * Get featured providers for a specific screen (PUBLIC)
 */
export const getFeaturedProviders = async (req, res) => {
  try {
    const { screen } = req.params;
    const { category, region, limit = 10 } = req.query;

    import('../models/Providers.js').then(async ({ default: Provider }) => {
      // Build query based on screen
      let query = { isApproved: true };

      // Handle different screen types
      switch (screen) {
        case 'home':
          // For home screen, get providers promoted on home
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
        query.region = region;
      }

      console.log('Featured providers query:', JSON.stringify(query));

      // Get featured providers
      const providers = await Provider.find(query)
        .sort({ averageRating: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .select('-reviews -__v');

      // Fix URLs for response
      const baseUrl = process.env.API_URL || 'http://localhost:5000';
      const providersWithUrls = providers.map(provider => {
        const providerObj = provider.toObject();
        
        if (providerObj.profilePic && !providerObj.profilePic.startsWith('http')) {
          providerObj.profilePic = `${baseUrl}/${providerObj.profilePic.replace(/^\//, '')}`;
        }
        
        return providerObj;
      });

      res.json({
        success: true,
        screen,
        count: providersWithUrls.length,
        providers: providersWithUrls
      });
    }).catch(error => {
      console.error('Error importing Provider model:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    });

  } catch (error) {
    console.error('Error fetching featured providers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};