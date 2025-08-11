const mongoose = require("mongoose");



const vendorsSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: true, // Assuming username is required
  },
  categoryName: {
    type: String,
    required: true, // Assuming username is required
  },
  startDate: {
    type: String,
    required: true, // Assuming username is required
  },
  currency: {
    type: String,
    required: true, // Assuming username is required
  },
  logo: {
    type:String,
    required: true, // Assuming username is required
  },
  website: {
    type: String,
    required: true,
    // Email validation
  },
  phoneNumber: {
    type: String,
    required: true, // Assuming phone number is required
  },
  country: {
    type: String,
  },
  state: {
    type: String,
  },
  city: {
    type: String,
  },
   postalCode: {
    type: String,
  },
  
   companyDetails: {
    type: String,
    required: true, // Assuming company details are required
  },
  
   username: {
    type: String,
    required: true, // Assuming username is required
  },
  
  email: {
    type: String,
    unique: true, // Assuming email should be unique
    match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    required: true, // Assuming email  is required
  },
   facebookLink: {
    type: String,
    required: false, // Assuming it's optional
  },
  instagramLink: {
    type: String,
    required: false, // Assuming it's optional
  },
  linkedinLink: {
    type: String,
    required: false, // Assuming it's optional
  },
  youtubeLink: {
    type: String,
    required: false, // Assuming it's optional
  },
  twitterLink: {
    type: String,
    required: false, // Assuming it's optional
  },
 
  
 
  password: {
    type: String,
    required: true, // Assuming password is required
  },
  confirmPassword: {
    type: String,
    required: true, // Assuming confirm password is required
  },
  acceptTerms: {
    type: Boolean,
    required: true, // Assuming acceptance of terms is required
  },
  tokens: [
    {
      token: {
        type: String,
        required: true, // Assuming token is required
      },
    },
  ],
});

// Create a model for "vendors" collection
module.exports = mongoose.model("vendors", vendorsSchema);
