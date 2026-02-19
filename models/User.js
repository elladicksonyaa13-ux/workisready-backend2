import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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
    // In models/User.js
phone: {
  type: String,
  default: null,
  unique: true,
  sparse: true, // This allows multiple null/empty values
  trim: true,
},
whatsapp: {
  type: String,
  default: null,
  unique: true,
  sparse: true,
  trim: true,
},
    location: {
      type: String,
      default: "",
    },
    region: {
      type: String,
      default: "",
    },

    district: {
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
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
    },
    verificationTokenExpires: {
      type: Date,
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


/*GENERATE VERIFICATION TOKEN*/
userSchema.methods.generateVerificationToken = function () {
  const token = crypto.randomBytes(32).toString("hex");

  this.verificationToken = token;
  this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return token;

}

/* 🧼 SAFE RESPONSE */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  delete obj.googleId; // Optional: remove for privacy
  delete obj.verificationToken;
  delete obj.verificationTokenExpires
  return obj;
};

// Add indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ authProvider: 1 });

export default mongoose.model("User", userSchema);
