import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true,
    },
    fname: {
      type: String,
      default: "",
    },
    sname: {
      type: String,
      default: "",
    },
    oname: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function () {
        // Password is required only for local auth, not for Google OAuth
        return this.authProvider === "local" || !this.authProvider;
      },
      minlength: 6,
      select: false,
    },
    
    // Google OAuth Fields (ADD THESE)
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Allows null values while maintaining uniqueness
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook"], // Add more as needed
      default: "local",
    },
    
    // Contact Information
    phone: {
      type: String,
      default: "",
    },
    whatsapp: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    region: {
      type: String,
      default: "",
    },
    
    // User Type
    userType: {
      type: String,
      enum: ["client", "worker"],
      default: "client",
    },
    
    // Profile Image
    profileImage: {
      type: String,
      default: "",
    },

    // Email Verification Fields
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },
    
    // Approval System Fields
    isApproved: {
      type: Boolean,
      default: false,
    },
    hasPendingChanges: {
      type: Boolean,
      default: false,
    },
    pendingProfileData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    originalProfileData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastApprovedAt: {
      type: Date,
      default: null,
    },
    pendingChangesSubmittedAt: {
      type: Date,
      default: null,
    },

    // Password Reset
    resetToken: String,
    resetTokenExpiry: Date,

    // Ratings
    averageRating: {
      type: Number,
      default: 0,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },

    // Role
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
  },
  { timestamps: true }
);

/* 🔐 HASH PASSWORD BEFORE SAVE */
userSchema.pre("save", async function (next) {
  // Skip password hashing for Google OAuth users or if password is not modified
  if (!this.isModified("password") || this.authProvider !== "local") {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/* 🔑 COMPARE PASSWORD */
userSchema.methods.comparePassword = async function (enteredPassword) {
  // If user is Google OAuth and doesn't have a password, return false
  if (this.authProvider !== "local" || !this.password) {
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

/* 🧼 SAFE RESPONSE */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  delete obj.googleId; // Optional: remove for privacy
  return obj;
};

// Add indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ authProvider: 1 });

export default mongoose.model("User", userSchema);
