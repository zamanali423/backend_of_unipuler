const getRoomKey = require("../utils/getRoomKey");
const Lead = require("../models/Lead");
const Job = require("../models/jobs");
const handleRequests = require("./handleRequests");

const countAndEmit = async (Model, filter, event, extraData, socket) => {
  try {
    const count = await Model.countDocuments(filter);
    socket.emit(event, { ...extraData, count });
  } catch (err) {
    console.error(`Error fetching ${event}:`, err);
  }
};

const connection = (io) => {
  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join project room
    socket.on("join_project", async ({ vendorId, projectCategory }) => {
      const roomKey = getRoomKey(vendorId, projectCategory);
      socket.join(roomKey);

      console.log(`Client ${socket.id} joined room: ${roomKey}`);

      await countAndEmit(
        Lead,
        { vendorId, projectCategory },
        "total_lead",
        { projectCategory },
        socket
      );
    });

    // Join job room
    socket.on("join_job", async ({ vendorId, title }) => {
      const roomKey = getRoomKey(vendorId, title);
      socket.join(roomKey);

      console.log(`Client ${socket.id} joined room: ${roomKey}`);

      await countAndEmit(
        Job,
        { vendorId, title },
        "total_job",
        { title },
        socket
      );
    });

    // Leave project room
    socket.on("leave_project", ({ vendorId, projectCategory }) => {
      const roomKey = getRoomKey(vendorId, projectCategory);
      socket.leave(roomKey);
      console.log(`Socket ${socket.id} left room: ${roomKey}`);
    });

    // Leave job room
    socket.on("leave_job", ({ vendorId, title }) => {
      const roomKey = getRoomKey(vendorId, title);
      socket.leave(roomKey);
      console.log(`Socket ${socket.id} left room: ${roomKey}`);
    });

    // Handle other requests
    handleRequests(socket, io);

    // Disconnect event
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
};

// Live change stream for leads
const initLeadStream = (io) => {
  const changeStream = Lead.watch([], { fullDocument: "updateLookup" });

  changeStream.on("change", async (change) => {
    if (change.operationType === "insert") {
      const newLead = change.fullDocument;
      const roomKey = getRoomKey(newLead.vendorId, newLead.projectCategory);

      console.log("📢 New lead inserted:", newLead);
      io.to(roomKey).emit("lead", newLead);

      //for leads
      await countAndEmit(
        Lead,
        {
          vendorId: newLead.vendorId,
          projectCategory: newLead.projectCategory,
        },
        "total_lead",
        { projectCategory: newLead.projectCategory },
        io.to(roomKey)
      );
    }
  });
};

// Live change stream for jobs
const initJobStream = (io) => {
  const changeStream = Job.watch([], { fullDocument: "updateLookup" });

  changeStream.on("change", async (change) => {
    if (change.operationType === "insert") {
      const newJob = change.fullDocument;
      const roomKey = getRoomKey(newJob.vendorId, newJob.title);

      console.log("📢 New job inserted:", newJob);
      io.to(roomKey).emit("job", newJob);

      //for jobs
      await countAndEmit(
        Job,
        {
          vendorId: newJob.vendorId,
          title: newJob.title,
        },
        "total_job",
        { title: newJob.title },
        io.to(roomKey)
      );
    }
  });
};

module.exports = { connection, initLeadStream, initJobStream };
