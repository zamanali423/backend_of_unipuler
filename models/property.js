const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema({
  source: { type: String, required: true }, // e.g. "Rightmove", "Idealista"
  title: { type: String },
  price: { type: String },
  currency: { type: String }, // e.g. "€", "£"
  location: { type: String },
  bedrooms: { type: Number },
  bathrooms: { type: Number },
  size: { type: String }, // e.g. "80 m²"
  url: { type: String, required: true, unique: true },
  image: { type: String },
  description: { type: String },
  scrapedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Property", propertySchema);
