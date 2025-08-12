const Bull = require("bull");
const Project = require("../models/Project");
const { searchGoogleMaps } = require("./scraperService");

console.log("Queue file loaded");

const projectQueue = new Bull("projectQueue", {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    maxRetriesPerRequest: null,
  },
});

async function initQueue(mongoose, io) {
  console.log("initQueue function called");

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB not connected");
  }

  projectQueue.process(1, async (job, done) => {
    console.log("Processing job:", job.data);
    const { project } = job.data;

    try {
      await Project.findByIdAndUpdate(project._id, { status: "Running" });
      io.emit("projectStatusUpdate", { projectId: project.projectId, status: "Running" });
      job.progress(10);

      const data = await searchGoogleMaps(project, io);
      console.log("Google Maps data scraped:", data?.length);
      job.progress(100);

      if (!data || data.length === 0) {
        console.log("No data found, skipping this job.");
        await Project.findByIdAndUpdate(project._id, { status: "Finished" });
        io.emit("projectStatusUpdate", { projectId: project.projectId, status: "Finished" });
        return done();
      }

      const currentProjectStatus = await Project.findOne({
        projectId: project.projectId,
      });

      if (currentProjectStatus?.status === "Cancelled") {
        return done(); // Exit gracefully
      }

      await Project.findByIdAndUpdate(project._id, { status: "Finished" });
      console.log("Job processed successfully");
      io.emit("projectStatusUpdate", { projectId: project.projectId, status: "Finished" });
      done();
    } catch (error) {
      console.error("Error processing job:", error);
      await Project.findByIdAndUpdate(project._id, { status: "Failed" });
      io.emit("projectStatusUpdate", { projectId: project.projectId, status: "Failed" });
      done(error);
    }
  });
   projectQueue.on("completed", (job) => {
    console.log(`Job with ID ${job.id} completed`);
    io.emit("projectStatusUpdate", { projectId: job.data.project.projectId, status: "Finished" });
  });

  projectQueue.on("failed", (job, err) => {
    console.error(`Job with ID ${job.id} failed:`, err);
    io.emit("projectStatusUpdate", { projectId: job.data.project.projectId, status: "Failed" });
  });
}

async function pauseQueue() {
  await projectQueue.pause();
  console.log("Queue paused");
}

async function resumeQueue() {
  await projectQueue.resume();
  console.log("Queue resumed");
}

projectQueue.on("completed", (job) => {
  console.log(`Job with ID ${job.id} completed`);
});

projectQueue.on("failed", (job, err) => {
  console.error(`Job with ID ${job.id} failed with error:`, err);
});

projectQueue.on("error", (error) => {
  console.error("Queue encountered an error:", error);
});

process.on("SIGTERM", async () => {
  console.log("Graceful shutdown initiated");
  await projectQueue.close();
  process.exit(0);
});

function addTaskToQueue(project) {
  projectQueue.add({ project });
  console.log("Task added to the queue:", project);
}

async function pauseTask(projectId) {
  await Project.findOneAndUpdate({ projectId }, { pauseRequested: true });
  console.log(`Pause requested for project ${projectId}`);
}

async function resumeTask(projectId, id) {
  await Project.findOneAndUpdate({ projectId }, { pauseRequested: false });
  await Project.findByIdAndUpdate({ _id: id }, { status: "Running" });
  console.log(`Resume requested for project ${projectId}`);
}

async function cancelTaskFromQueue(projectId,io) {
  try {
    console.log("Cancelling job for project ID:", projectId);
     const project = await Project.findOne({ projectId });

    if (!project) return console.log(`Project ${projectId} not found.`);
    if (project.status === "Finished") {
       io.emit("projectStatusUpdate", { projectId, status: "Finished" });
      return console.log(`Project ${projectId} already finished.`);
    }
    else{
    await Project.findOneAndUpdate(
      { projectId },
      { cancelRequested: true, status: "Cancelled" },
      { new: true }
    );

    // ✅ Emit cancel status
    io.emit("projectStatusUpdate", { projectId, status: "Cancelled" });
    const jobs = await projectQueue.getJobs(["waiting", "active"]);
    const jobToCancel = jobs.find(
      (job) => job.data.project?.projectId === projectId
    );

    if (jobToCancel) {
      const state = await jobToCancel.getState();
      if (state === "waiting") {
        await jobToCancel.remove();
        console.log(`Removed waiting job for ${projectId}`);
      } else {
        console.log(`Job for ${projectId} is active, will stop in scraper`);
      }
    } else {
      console.log(`No job found for ${projectId}`);
    }
  }
  } catch (err) {
    console.error(`Error cancelling ${projectId}:`, err);
  }
}

module.exports = {
  initQueue,
  addTaskToQueue,
  cancelTaskFromQueue,
  pauseTask,
  resumeTask,
  pauseQueue,
  resumeQueue,
};
