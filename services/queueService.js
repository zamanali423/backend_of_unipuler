const Bull = require("bull");
const Project = require("../models/Project");
const { searchGoogleMaps } = require("./scraperService");
const Lead = require("../models/Lead");
const puppeteerExtra = require("puppeteer-extra");
const stealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(stealthPlugin());
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
  let browser;
  projectQueue.process(5, async (job, done) => {
    console.log("Processing job:", job.data);
    const { project } = job.data;

    try {
      await Project.findByIdAndUpdate(project._id, { status: "Running" });
      io.emit("projectStatusUpdate", {
        projectId: project.projectId,
        status: "Running",
      });
      job.progress(10);
      if (!browser) {
        browser = await puppeteerExtra.launch({
          headless: "new",
          ignoreHTTPSErrors: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        });
      }

      const data = await searchGoogleMaps(project, io, browser);
      console.log("Google Maps data scraped:", data?.length);
      job.progress(100);

      if (!data || data.length === 0) {
        const latestProject = await Project.findById(project._id).lean();
        if (latestProject.status == "Cancelled") {
          await Project.findByIdAndUpdate(project._id, {
            status: "Cancelled",
          });
          io.emit("projectStatusUpdate", {
            projectId: project.projectId,
            status: "Cancelled",
          });
        } else {
          await Project.findByIdAndUpdate(project._id, {
            status: "Finished",
          });
          io.emit("projectStatusUpdate", {
            projectId: project.projectId,
            status: "Finished",
          });
        }
        return done();
      }

      const currentProjectStatus = await Project.findOne({
        projectId: project.projectId,
      });

      if (currentProjectStatus?.status === "Cancelled") {
        return done(); // Exit gracefully
      }
      const latestProject = await Project.findById(project._id).lean();
      if (
        latestProject.status == "Cancelled" ||
        latestProject.cancelRequested
      ) {
        await Project.findByIdAndUpdate(project._id, { status: "Cancelled" });
        io.emit("projectStatusUpdate", {
          projectId: project.projectId,
          status: "Cancelled",
        });
      } else {
        await Project.findByIdAndUpdate(project._id, { status: "Finished" });
        io.emit("projectStatusUpdate", {
          projectId: project.projectId,
          status: "Finished",
        });
      }
      done();
    } catch (error) {
      console.error("Error processing job:", error);
      await Project.findByIdAndUpdate(project._id, { status: "Failed" });
      io.emit("projectStatusUpdate", {
        projectId: project.projectId,
        status: "Failed",
      });
      done(error);
    }
  });
  projectQueue.on("completed", async (job) => {
    const latest = await Project.findOne({
      projectId: job.data.project.projectId,
    }).lean();
    io.emit("projectStatusUpdate", {
      projectId: job.data.project.projectId,
      status: latest?.status || "Finished",
    });
  });

  projectQueue.on("failed", (job, err) => {
    console.error(`Job with ID ${job.id} failed:`, err);
    io.emit("projectStatusUpdate", {
      projectId: job.data.project.projectId,
      status: "Failed",
    });
  });

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
    try {
      await projectQueue.close();
    } catch {}
    try {
      if (browser) await browser.close();
    } catch {}
    process.exit(0);
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

function addTaskToQueue(project, priority = 1) {
  projectQueue.add(
    { project },
    { priority },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
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

async function cancelTaskFromQueue(projectId, io) {
  try {
    console.log("Cancelling job for project ID:", projectId);

    const project = await Project.findOne({ projectId });
    if (!project) {
      console.log(`Project ${projectId} not found.`);
      return;
    }

    // If project already finished, just emit finished
    if (project.status === "Finished") {
      io.emit("projectStatusUpdate", { projectId, status: "Finished" });
      console.log(`Project ${projectId} already finished.`);
      return;
    }

    // Count leads for this project
    const leadsCount = await Lead.countDocuments({
      vendorId: project.vendorId,
      projectCategory: project.businessCategory,
      // city: project.city, // only if needed
    });
    if (project.status === "Running") {
      if (leadsCount > 0) {
        // Leads available → treat as finished
        await Project.findOneAndUpdate(
          { projectId },
          { cancelRequested: true, status: "Finished" },
          { new: true }
        );
        io.emit("projectStatusUpdate", { projectId, status: "Finished" });
        console.log(
          `Project ${projectId} marked as Finished (Leads available: ${leadsCount})`
        );
      } else {
        // No leads → treat as cancelled
        await Project.findOneAndUpdate(
          { projectId },
          { cancelRequested: true, status: "Cancelled" },
          { new: true }
        );
        io.emit("projectStatusUpdate", { projectId, status: "Cancelled" });
        console.log(`Project ${projectId} marked as Cancelled (No leads)`);
      }
    }
    // Remove job from queue if it's waiting
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
        console.log(
          `Job for ${projectId} is active, scraper will stop in scraper`
        );
      }
    } else {
      console.log(`No job found for ${projectId}`);
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
