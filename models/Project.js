const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema(
  {
    vendorId: { type: String },
    projectId: { type: String, required: true, unique: true },
    projectName: { type: String },
    city: { type: String, required: true },
    businessCategory: { type: String, required: true },
    status: {
      type: String,
      enum: ["Running", "Finished", "Cancelled", "Failed"],
      default: "Running",
    },
    cancelRequested: { type: Boolean, default: false },
    pauseRequested: { type: Boolean, default: false },
  },
  {
    timestamps: true, // adds createdAt & updatedAt automatically
  }
);

module.exports = mongoose.model("Project", ProjectSchema);
