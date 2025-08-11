// models/news.js
const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      required: true,
      unique: true, // ✅ Prevent duplicate articles
      trim: true,
    },
    summary: {
      type: String,
      trim: true,
    },
    publishedDate: {
      type: Date,
    },
    scrapedAt: {
      type: Date,
      default: Date.now, // ✅ Auto timestamp for scraping
    },
  },
  { timestamps: true } // ✅ Adds createdAt & updatedAt
);

module.exports = mongoose.model("News", newsSchema);
