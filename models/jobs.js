const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  source: { type: String, required: true }, // e.g. 'Indeed', 'LinkedIn'
  title: { type: String, required: true },
  company: { type: String },
  location: { type: String },
  link: { type: String, required: true },
  salary: { type: String },
  postedDate: { type: Date },
  scrapedAt: { type: Date, default: Date.now },
  vendorId: { type: String },
});

// Prevent duplicates: unique combination of title, company, and link
jobSchema.index({ title: 1, company: 1, link: 1 }, { unique: true });

module.exports = mongoose.model('Job', jobSchema);
