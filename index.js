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
const {
  initLeadStream,
  connection,
  initJobStream,
} = require("./sockets/connection");

// Routes
const projectRoutes = require("./routes/projectRoutes");
const userRouter = require("./routes/admin/users/users");
const leadRouter = require("./routes/Leads");
const app = express();

// Create HTTP server for both Express and Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    path: "/unipullar/socket.io",   // 👈 must match nginx + frontend

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong" });
});

// Start server after DB and queue are ready
(async () => {
  try {
    await connectDB();
    console.log("MongoDB connected successfully");

    await initQueue(mongoose, io);
    console.log("Queue initialized successfully");
    connection(io);
    app.use("/scraping", scrapingRoutes(io));
    initLeadStream(io);
    initJobStream(io);
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
})();

