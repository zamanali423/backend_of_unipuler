const Lead = require("../models/Lead");
const Project = require("../models/Project");
const { addTaskToQueue } = require("../services/queueService");

exports.createProject = async (req, res) => {
  try {
    const { vendorId,projectId, projectName, city, businessCategory } = req.body;
    console.log(req.body);
    const project = new Project({
      vendorId,
      projectId,
      projectName,
      city,
      businessCategory,
    });
    // Add the project to the scraping queue
    await project.save();
    console.log("Projects saved",project.vendorId);
    addTaskToQueue(project);

    res.status(201).json({ message: "Project created successfully", project });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ vendorId: req.params.vendorId });
    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.getProjectsByCategory = async (req, res) => {
    try {
    const { businessCategory } = req.params;

    if (!businessCategory) {
      return res.status(400).json({ msg: "Category is required" });
    }

    const projects = await Lead.find({ businessCategory: category });

    if (!projects || projects.length === 0) {
      return res.status(404).json({ msg: `No leads found for ${category}` });
    }

    return res.status(200).json(projects);
  } catch (error) {
    console.error("Error fetching projects by category:", error.message);
    return res.status(500).json({ msg: "Server error while fetching projects" });
  }
}
//! delete project
exports.deleteProject = async (req, res) => {
  try {
    const id = req.params.id;
    const projects = await Project.findByIdAndDelete(id);
    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};


/**
 * POST /api/project/start-scrape
 * Body: { projectId }
 */
exports.startScraping = async (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "projectId is required" });
  }

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.status === "Cancelled") {
      return res.status(400).json({ error: "Project has already been cancelled" });
    }

    // Set project status to "Running"
    await Project.findByIdAndUpdate(projectId, { status: "Running" });

    // Begin scraping
    const data = await searchGoogleMaps(project);

    if (!data || data.length === 0) {
      await Project.findByIdAndUpdate(projectId, { status: "Finished" });
      return res.json({ status: "Finished", message: "No data found" });
    }

    // Check if cancelled during scraping
    const updatedProject = await Project.findById(projectId);
    if (updatedProject.status === "Cancelled") {
      return res.json({ status: "Cancelled", message: "Project cancelled during scraping" });
    }

    await Project.findByIdAndUpdate(projectId, { status: "Finished" });

    return res.json({ status: "Finished", message: "Scraping completed successfully" });
  } catch (err) {
    console.error("Scraping failed:", err);
    await Project.findByIdAndUpdate(projectId, { status: "Failed" });
    return res.status(500).json({ error: "Scraping failed", details: err.message });
  }
};

/**
 * POST /api/project/cancel-task
 * Body: { projectId }
 */
exports.cancelTask = async (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "projectId is required" });
  }

  try {
    const project = await Project.findOneAndUpdate(
      { projectId },
      { cancelRequested: true, status: "Cancelled" },
      { new: true }
    );

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.json({ status: "Cancelled", message: "Project marked as cancelled" });
  } catch (err) {
    console.error("Cancel task failed:", err);
    return res.status(500).json({ error: "Failed to cancel task", details: err.message });
  }
};