const express = require("express");
const verifyToken = require("../middleware/verifyToken");

module.exports = (io) => {
  const router = express.Router();

  const createJobScraperController = require("../services/jobScraping");
  const scrapeAllProperties = require("../services/scrape_property");
  const scrapeAllNews = require("../services/scrape_news");

  const { scrapeAllJobs, getJobs } = createJobScraperController(io);

  router.post("/jobs", verifyToken, scrapeAllJobs);
  router.get("/get-jobs", verifyToken, getJobs);
  router.post("/property", verifyToken, scrapeAllProperties);
  router.post("/news", verifyToken, scrapeAllNews);

  return router;
};
