const express = require("express");
const router = express.Router();
const Lead = require("../models/Lead");
const verifyToken = require("../middleware/verifyToken");
const { cancelTaskFromQueue } = require("../services/queueService");

router.get("/allLeads", verifyToken, async (req, res) => {
  const vendorId = req.user.email;
  console.log(vendorId);
  try {
    console.log("Fetching leads...");
    const leads = await Lead.find({ vendorId });
    console.log("Fetched leads:");

    // Check if leads were found
    if (leads.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No leads found" });
    }

    // Respond with the leads data
    res.status(200).json({ success: true, data: leads });
  } catch (error) {
    // Log the error for better insight
    console.error("Error fetching leads:", error);

    // Respond with an error status and message
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

//! show specific lead
router.get("/specific-lead/:category", verifyToken, async (req, res) => {
  const { category } = req.params;
  const vendorId = req.user.email;
  console.log(category);
  
  try {
    const leads = await Lead.find({
      projectCategory: category,
      vendorId,
    });

    // Check if leads were found
    if (leads.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No leads found" });
    }

    // Respond with the leads data
    res.status(200).json({ success: true, data: leads });
  } catch (error) {
    // Log the error for better insight
    console.error("Error fetching leads:", error);

    // Respond with an error status and message
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

//! cancel leads
router.get("/cancelLead", async (req, res) => {
  console.log("cancel id", req.query.projectId);
  await cancelTaskFromQueue(req.query.projectId);
  res.status(200).json({ success: true, message: "lead cancelled" });
});

module.exports = router;
