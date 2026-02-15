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
