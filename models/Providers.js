// models/Provider.js
import mongoose from "mongoose";

const providerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // ✅ One provider profile per user
    },

    // Names (from frontend form)
    firstName: { type: String, required: true, trim: true },
    surname: { type: String, required: true, trim: true },
    otherName: { type: String, default: "", trim: true },
    fullName: { type: String, required: true, trim: true }, // Auto-generated

    // Location (split like the form)
    city: { type: String, required: true },
    region: { type: String, required: true },
    district: { type: String, required: true},

    // Categories (MULTI SELECT)
    category: {
      type: [String],          // ✅ ARRAY — matches frontend
      required: true,
      validate: {
        validator: (v) => v.length > 0 && v.length <= 5,
        message: "Select between 1 and 5 service categories",
      },
    },

    // Skills (from frontend)
    skills: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= 15,
        message: "Maximum 15 skills allowed",
      },
    },

    // Professional details (from frontend)
    bio: { 
      type: String, 
      required: true,
      minlength: [50, "Bio must be at least 50 characters"],
      maxlength: [1000, "Bio cannot exceed 1000 characters"]
    },

    experience: {
      type: String,
      enum: ["", "less-1", "1-3", "3-5", "5-10", "10+"],
      default: ""
    },

    hourlyRate: {
      type: String,
      default: ""
    },
    isFeatured: {
    type: Boolean,
    default: false
  },

    availability: {
      type: String,
      enum: ["flexible", "weekdays", "weekends", "evenings"],
      default: "flexible"
    },

    // Contact (auto-filled, not editable)
    phone: { type: String, required: true },
    whatsapp: { type: String },
    email: { type: String, required: true },

    // Media
    // In models/Provider.js
profilePic: { 
  type: String, 
  default: "",
  validate: {
    validator: function(v) {
      // Allow empty string (for no profile pic)
      if (v === "") return true;
      
      // Normalize path for validation
      const normalizedPath = v.replace(/\\/g, '/');
      
      // Check if it's a valid upload path
      const isValidUploadPath = normalizedPath.startsWith("uploads/providers/");
      
      // Also allow full URLs (if you ever use cloud storage)
      const isUrl = /^https?:\/\//.test(v);
      
      return isValidUploadPath || isUrl;
    },
    message: props => `Invalid profile picture path: ${props.value}`
  }
},

    sampleWork: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= 10,
        message: "Maximum 10 sample work images allowed",
      },
    },

    // Reviews and ratings
    reviews: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        name: { type: String, required: true },
        rating: { 
          type: Number, 
          required: true, 
          min: [1, "Rating must be at least 1"],
          max: [5, "Rating cannot exceed 5"]
        },
        comment: { 
          type: String, 
          required: true,
          maxlength: [500, "Comment cannot exceed 500 characters"]
        },
        date: { type: Date, default: Date.now },
      },
    ],

    // Status
    isApproved: {
      type: Boolean,
      default: false,
      index: true // For faster filtering
    },

    averageRating: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 5
    },

    // Statistics
    totalJobs: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    responseRate: { type: Number, default: 0 }, // Percentage
    responseTime: { type: Number, default: 0 }, // Hours average

    // Verification
    isVerified: { type: Boolean, default: false },
    verificationDate: { type: Date },
    verificationMethod: {
      type: String,
      enum: ["id-card", "phone", "email", "manual", null],
      default: null
    },

    // Preferences
    notificationPreferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: true },
      whatsappNotifications: { type: Boolean, default: false }
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ⭐ Rating helper
providerSchema.methods.calculateRating = function () {
  if (this.reviews.length === 0) {
    this.averageRating = 0;
    return;
  }

  const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
  this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
};

// ⭐ Generate fullName BEFORE validation (FIXED)
providerSchema.pre("validate", function (next) {
  if (this.firstName && this.surname) {
    this.fullName = `${this.firstName} ${this.surname}${this.otherName ? ` ${this.otherName}` : ""}`.trim();
  }
  next();
});

// ⭐ Keep this as backup for any updates
providerSchema.pre("save", function (next) {
  // Ensure fullName is always set if it somehow got missed
  if ((!this.fullName || this.fullName === "") && this.firstName && this.surname) {
    this.fullName = `${this.firstName} ${this.surname}${this.otherName ? ` ${this.otherName}` : ""}`.trim();
  }
  next();
});

// ⭐ Also update the findOneAndUpdate hook to use same logic
providerSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  
  if (update.firstName || update.surname || update.otherName) {
    const firstName = update.firstName || this._update.firstName;
    const surname = update.surname || this._update.surname;
    const otherName = update.otherName || this._update.otherName || "";
    
    if (firstName && surname) {
      this.set({
        fullName: `${firstName} ${surname}${otherName ? ` ${otherName}` : ""}`.trim()
      });
    }
  }
  
  next();
});

// ⭐ Virtual for formatted hourly rate
providerSchema.virtual("formattedHourlyRate").get(function () {
  if (!this.hourlyRate || this.hourlyRate === "") return "Negotiable";
  return `₵${this.hourlyRate}/hour`;
});

// ⭐ Virtual for experience label
providerSchema.virtual("experienceLabel").get(function () {
  const labels = {
    "": "Not specified",
    "less-1": "Less than 1 year",
    "1-3": "1-3 years",
    "3-5": "3-5 years",
    "5-10": "5-10 years",
    "10+": "10+ years"
  };
  return labels[this.experience] || "Not specified";
});

// ⭐ Virtual for availability label
providerSchema.virtual("availabilityLabel").get(function () {
  const labels = {
    "flexible": "Flexible",
    "weekdays": "Weekdays only",
    "weekends": "Weekends only",
    "evenings": "Evenings only"
  };
  return labels[this.availability] || "Flexible";
});

// ⭐ Indexes for better query performance
providerSchema.index({ fullName: "text", bio: "text", skills: "text" });
providerSchema.index({ city: 1, region: 1, district: 1 });
providerSchema.index({ averageRating: -1 });
providerSchema.index({ category: 1 });
providerSchema.index({ isApproved: 1, createdAt: -1 });

// ⭐ Static method for search
providerSchema.statics.searchProviders = async function (query, filters = {}) {
  const { 
    category, 
    region, 
    city, 
    minRating, 
    isAvailable,
    skip = 0,
    limit = 20 
  } = filters;

  const searchQuery = {};
  
  // Text search
  if (query) {
    searchQuery.$text = { $search: query };
  }
  
  // Filter by category
  if (category) {
    searchQuery.category = { $in: [category] };
  }
  
  // Filter by location
  if (region) {
    searchQuery.region = region;
  }
  
  if (city) {
    searchQuery.city = city;
  }
  
  // Filter by rating
  if (minRating) {
    searchQuery.averageRating = { $gte: minRating };
  }
  
  // Only show approved providers for public searches
  if (!filters.includePending) {
    searchQuery.isApproved = true;
  }
  
  return this.find(searchQuery)
    .sort({ averageRating: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select("-__v -notificationPreferences -verificationMethod")
    .populate("userId", "username profilePic");
};

export default mongoose.model("Provider", providerSchema);