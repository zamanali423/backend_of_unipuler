const Bull = require("bull");
const Project = require("../models/Project");
const { searchGoogleMaps } = require("./scraperService");
const Lead = require("../models/Lead");
const puppeteerExtra = require("puppeteer-extra");
const stealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(stealthPlugin());

console.log("Queue file loaded");

// Map to store queues per project
const projectQueues = new Map();
let IoInstance = null;

function createProjectQueue(projectId, io) {
  if (projectQueues.has(projectId)) {
    return projectQueues.get(projectId);
  }

  const queue = new Bull(`projectQueue_${projectId}`, {
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      maxRetriesPerRequest: null,
    },
  });

  queue.process(1, async (job, done) => {
    const { project } = job.data;
    console.log("Processing project:", project.projectId);

    try {
      await Project.findByIdAndUpdate(project.projectId, { status: "Running" });
      io.emit("projectStatusUpdate", {
        projectId: project.projectId,
        status: "Running",
      });
      job.progress(10);

      const businesses = await searchGoogleMaps(project, io);
      console.log("Google Maps data scraped:", businesses?.length);
      job.progress(100);

      if (!businesses || businesses.length === 0) {
        const latest = await Project.findById(project.projectId).lean();
        const status = latest.status === "Cancelled" ? "Cancelled" : "Finished";
        await Project.findByIdAndUpdate(project.projectId, { status });
        io.emit("projectStatusUpdate", {
          projectId: project.projectId,
          status,
        });
        return done();
      }

      const latest = await Project.findById(project.projectId).lean();
      if (latest.status === "Cancelled" || latest.cancelRequested) {
        await Project.findByIdAndUpdate(project.projectId, { status: "Cancelled" });
        io.emit("projectStatusUpdate", {
          projectId: project.projectId,
          status: "Cancelled",
        });
      } else {
        await Project.findByIdAndUpdate(project.projectId, { status: "Finished" });
        io.emit("projectStatusUpdate", {
          projectId: project.projectId,
          status: "Finished",
        });
      }

      done();
    } catch (error) {
      console.error("Error processing job:", error);
      await Project.findByIdAndUpdate(project.projectId, { status: "Failed" });
      io.emit("projectStatusUpdate", {
        projectId: project.projectId,
        status: "Failed",
      });
      done(error);
    }
  });

  // Queue events
  queue.on("completed", async (job) => {
    console.log(`Job for ${projectId} completed`);
  });

  queue.on("failed", (job, err) => {
    console.error(`Job for ${projectId} failed:`, err);
  });

  queue.on("error", (error) => {
    console.error(`Queue error for ${projectId}:`, error);
  });

  // Save to map
  projectQueues.set(projectId, queue);
  return queue;
}

// ----------------- Public API ------------------

async function initQueue(mongoose, io) {
  IoInstance = io;
  console.log("initQueue function called");
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB not connected");
  }

  process.on("SIGTERM", async () => {
    console.log("Graceful shutdown initiated");
    for (const queue of projectQueues.values()) {
      try {
        await queue.close();
      } catch {}
    }
    process.exit(0);
  });
}

function addTaskToQueue(project, priority = 1) {
  if (!IoInstance) {
    console.log("IoInstance is not initialized");
    return;
  }
  const queue = createProjectQueue(project.projectId, IoInstance);
  queue.add({ project }, { priority });
  console.log("Task added:", project.projectId);
}

async function cancelTaskFromQueue(projectId) {
  const queue = projectQueues.get(projectId);
  if (!queue) {
    console.log(`No queue found for project ${projectId}`);
    return;
  }

  const project = await Project.findOne({ projectId });
  if (!project) return;

  if (project.status === "Finished") {
    if (IoInstance) IoInstance.emit("projectStatusUpdate", { projectId, status: "Finished" });
    return;
  }

  const leadsCount = await Lead.countDocuments({
    vendorId: project.vendorId,
    projectCategory: project.businessCategory,
  });

  if (project.status === "Running") {
    const status = leadsCount > 0 ? "Finished" : "Cancelled";
    await Project.findOneAndUpdate(
      { projectId },
      { cancelRequested: true, status },
      { new: true }
    );
    if (IoInstance) IoInstance.emit("projectStatusUpdate", { projectId, status });
  }

  const jobs = await queue.getJobs(["waiting", "active"]);
  const jobToCancel = jobs.find(
    (job) => job.data.project?.projectId === projectId
  );

  if (jobToCancel) {
    const state = await jobToCancel.getState();
    if (state === "waiting") {
      await jobToCancel.remove();
      console.log(`Removed waiting job for ${projectId}`);
    } else {
      console.log(`Job for ${projectId} already active`);
    }
  }
}

async function pauseQueue(projectId) {
  const queue = projectQueues.get(projectId);
  if (queue) {
    await queue.pause();
    console.log(`Queue paused for ${projectId}`);
  }
}

async function resumeQueue(projectId) {
  const queue = projectQueues.get(projectId);
  if (queue) {
    await queue.resume();
    console.log(`Queue resumed for ${projectId}`);
  }
}

module.exports = {
  initQueue,
  addTaskToQueue,
  cancelTaskFromQueue,
  pauseQueue,
  resumeQueue,
};
