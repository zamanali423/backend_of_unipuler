const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"], // Email validation
  },
  password: {
    type: String,
    required: true,
  },
  otp:{type:String},
  otpExpires:{type:String},
  phone:{type:Number},
  tokens: [
    {
      token: {
        type: String,
        required: true, // Assuming token is required
      },
    },
  ],
});

// Create a model for "admins" collection
module.exports = mongoose.model("admins", adminSchema);
