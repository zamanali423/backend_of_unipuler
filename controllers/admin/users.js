const bcryptjs = require("bcryptjs");
const adminData = require("../../models/adminData/adminData");
const jobs = require("../../models/jobs");
const Lead = require("../../models/Lead");
const Project = require("../../models/Project");

const allUsers = async (req, res) => {
  try {
    const users = await adminData.find();
    if (!users) {
      return res.status(404).json({ message: "No users found" });
    }
    // Extract emails from users
    const emails = users.map((user) => user.email);

    // Query related data using the extracted emails
    const jobsData = await jobs.find({ vendorId: { $in: emails } });
    const leadsData = await Lead.find({ vendorId: { $in: emails } });
    const projectsData = await Project.find({
      vendorId: { $in: emails },
    });
    res.status(200).json({
      users: users,
      totalJobs: jobsData,
      totalLeads: leadsData,
      totalProjects: projectsData,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  const { email: paramEmail } = req.params; // This is the email in the route parameter
  const { username, email: bodyEmail, password } = req.body; // These are from the request body

  try {
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Update query to use the route parameter email to find the user
    const query = { email: paramEmail };
    const update = {};

    // Build update object conditionally
    if (username) update.username = username;
    if (bodyEmail) update.email = bodyEmail; // Use email from body if provided
    if (password) update.password = hashedPassword;

    const options = { new: true, runValidators: true };

    // Try to update in both collections
    const Vendor = require("../../models/customerData/customerData");
    const Admin = require("../../models/adminData/adminData");

    const user =
      (await Vendor.findOneAndUpdate(query, update, options)) ||
      (await Admin.findOneAndUpdate(query, update, options));

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const generateToken = require("../../authentication/generateToken");
    const token = await generateToken(user);

    return res.status(200).json({
      user: { id: user._id, username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    console.error("Error updating user profile:", error.message);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

module.exports = { allUsers, updateUserProfile };
