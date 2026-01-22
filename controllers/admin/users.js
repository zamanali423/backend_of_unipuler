const bcryptjs = require("bcryptjs");
const adminData = require("../../models/adminData/adminData");
const jobs = require("../../models/jobs");
const Lead = require("../../models/Lead");
const Project = require("../../models/Project");

const allUsers = async (req, res) => {
  try {
    const isAdmin = await adminData.findOne({
      email: req.user.email,
      role: "admin",
    });
    if (!isAdmin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const users = await adminData.find();
    if (!users) {
      return res.status(404).json({ message: "No users found" });
    }

    res.status(200).json({
      users: users,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const jobsDetails = async (req, res) => {
  try {
    const isAdmin = await adminData.findOne({
      email: req.user.email,
      role: "admin",
    });
    if (!isAdmin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const jobsData = await jobs.find();
    if (!jobsData) {
      return res.status(404).json({ message: "No jobs found" });
    }
    res.status(200).json({ jobsData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const leadsDetails = async (req, res) => {
  try {
    const isAdmin = await adminData.findOne({
      email: req.user.email,
      role: "admin",
    });
    if (!isAdmin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const leadsData = await Lead.find();
    if (!leadsData) {
      return res.status(404).json({ message: "No leads found" });
    }
    res.status(200).json({ leadsData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const projectsDetails = async (req, res) => {
  try {
    const isAdmin = await adminData.findOne({
      email: req.user.email,
      role: "admin",
    });
    if (!isAdmin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const projectsData = await Project.find();
    if (!projectsData) {
      return res.status(404).json({ message: "No projects found" });
    }
    res.status(200).json({ projectsData });
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

const deleteUser = async (req, res) => {
  const { email } = req.params;
  try {
    const isAdmin = await adminData.findOne({
      email: req.user.email,
      role: "admin",
    });
    if (!isAdmin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await adminData.findOneAndDelete({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const addAdmin = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const savedAdmin = await adminData.create({ username, email, password });
    res.status(201).json({ message: "Admin added successfully", savedAdmin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  allUsers,
  updateUserProfile,
  deleteUser,
  jobsDetails,
  leadsDetails,
  projectsDetails,
  addAdmin,
};
