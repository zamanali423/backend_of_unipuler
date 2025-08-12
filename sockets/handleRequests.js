const {
  cancelTaskFromQueue,
  pauseTask,
  resumeTask,
  pauseQueue,
  resumeQueue,
} = require("../services/queueService");

// perform all functions from socket
const handleRequests = (socket) => {
  socket.on("cancelTaskFromQueue", (projectId) => {
    cancelTaskFromQueue(projectId);
  });
  socket.on("pauseTask", (projectId) => {
    console.log("Pause projectId", projectId);
    pauseTask(projectId);
  });
  socket.on("resumeTask", (projectId, id) => {
    console.log("Resume projectId", projectId);
    console.log("Resume id", id);
    resumeTask(projectId, id);
  });
  socket.on("pauseQueue", () => {
    pauseQueue();
  });
  socket.on("resumeQueue", () => {
    resumeQueue();
  });
};

module.exports = handleRequests;
