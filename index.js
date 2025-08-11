require("dotenv").config();
console.log("Server starting...");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const { initQueue } = require("./services/queueService");
const scrapingRoutes = require("./routes/scrapingRoutes");

// Routes
const projectRoutes = require("./routes/projectRoutes");
const userRouter = require("./routes/admin/users/users");
const leadRouter = require("./routes/Leads");
const Lead = require("./models/Lead");
const { handleRequests } = require("./sockets/handleRequests");
const app = express();

// Create HTTP server for both Express and Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Routes
app.get("/", (req, res) => res.send("Welcome to the API"));
app.use("/api/projects", projectRoutes);
app.use("/auth/users", userRouter);
app.use("/", leadRouter);
app.use("/scraping", scrapingRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong" });
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Client joins a room for their vendor
  socket.on("joinVendor", (vendorId) => {
    socket.join(vendorId);
    console.log(`Client ${socket.id} joined vendor room: ${vendorId}`);
  });

  handleRequests(socket);
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Live change stream for leads
const initLeadStream = () => {
  const changeStream = Lead.watch([], { fullDocument: "updateLookup" });

  changeStream.on("change", (change) => {
    if (change.operationType === "insert") {
      const newLead = change.fullDocument;
      console.log("📢 New lead inserted:", newLead);

      // Send only to clients in the correct vendor room
      io.to(newLead.vendorId).emit("lead", newLead);
    }
  });
};

// Start server after DB and queue are ready
(async () => {
  try {
    await connectDB();
    console.log("MongoDB connected successfully");

    await initQueue(mongoose, io);
    console.log("Queue initialized successfully");

    initLeadStream();
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
})();
