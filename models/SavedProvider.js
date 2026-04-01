// models/SavedProvider.js
import mongoose from "mongoose";

const SavedProviderSchema = new mongoose.Schema(
  {
    userId: { type: String, 
      ref: "User", 
      required: true 
    },
      providerId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Provider", 
        required: true 
      },
  },
  { timestamps: true }
);

// prevent duplicates
SavedProviderSchema.index({ userId: 1, providerId: 1 }, { unique: true });

export default mongoose.model("SavedProvider", SavedProviderSchema);
