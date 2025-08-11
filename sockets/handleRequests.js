const {
  cancelTaskFromQueue,
  pauseTask,
  resumeTask,
  pauseQueue,
  resumeQueue,
} = require("../services/queueService");

// perform all functions from socket
module.exports = (socket) => {
  socket.on("cancelTaskFromQueue", (projectId) => {
    cancelTaskFromQueue(projectId);
  });
  socket.on("pauseTask", (projectId) => {
    pauseTask(projectId);
  });
  socket.on("resumeTask", (projectId) => {
    resumeTask(projectId);
  });
  socket.on("pauseQueue", () => {
    pauseQueue();
  });
  socket.on("resumeQueue", () => {
    resumeQueue();
  });
};
