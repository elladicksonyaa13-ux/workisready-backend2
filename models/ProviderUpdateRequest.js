import mongoose from "mongoose";

const providerUpdateRequestSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Provider",
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  changes: {
    category: [String],
    bio: String,
    skills: [String],
    experience: String,
    hourlyRate: String,
    availability: String,
    // sampleWork: [String] // URLs of new sample work
  },
  newSampleFiles: [String], // Paths to uploaded files (temporary)
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  rejectionReason: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  processedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const ProviderUpdateRequest = mongoose.model("ProviderUpdateRequest", providerUpdateRequestSchema);
export default ProviderUpdateRequest;