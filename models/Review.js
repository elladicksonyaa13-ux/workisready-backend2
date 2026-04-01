import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    worker: {
      type: String,
      ref: "User",
      required: true,
    },
    client: {
      type: String,
      ref: "User",
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Review", reviewSchema);
