const express = require("express");
const router = express.Router();
const Admin = require("../../../models/adminData/adminData");
const Vendor = require("../../../models/customerData/customerData");
const verifyToken = require("../../../middleware/verifyToken");
const generateToken = require("../../../authentication/generateToken");
const bcryptjs = require("bcryptjs");
const sendOtpEmail = require("../../../authentication/sendOtpEmail");

// Register Admin
router.post("/admin-register", async (req, res) => {
  const { email, otp } = req.body;

  try {

    if (!isValidEmail(email)) {
      return res.status(400).json({
        msg: "Invalid email domain. Only .edu, .org, .com or gmail.com allowed.",
      });
    }
    const admin = await Admin.findOne({ email });

    if (!admin || !admin.otp) {
      return res.status(400).json({ msg: "No pending registration for this email" });
    }

    if (admin.otp !== otp || admin.otpExpires < Date.now()) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    // ✅ Finalize registration
    admin.otp = null;
    admin.otpExpires = null;
    await admin.save();

    const token = await generateToken(admin);
    return res.status(200).json({
      msg: "Admin registered successfully",
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
      },
      token,
    });
  } catch (error) {
    console.error("Error in /admin-register:", error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
});

router.post("/send-otp", async (req, res) => {
  const { username, email, password, phone } = req.body;

  try {
    if (!isValidEmail(email)) {
      return res.status(400).json({
        msg: "Invalid email domain. Only .edu, .org, .com or gmail.com allowed.",
      });
    }

    let admin = await Admin.findOne({ email });
   
    // If admin exists and already verified
    if (admin && !admin.otp) {
      return res.status(400).json({ msg: "Email already registered" });
    }

    // If admin exists and still pending OTP
    if (admin && admin.otp) {
      await sendOtpEmail(admin.email, admin.otp);
      return res.status(200).json({ msg: "OTP already sent. Please check your email." });
    }

    // Generate OTP and save temp user
    const generatedOtp = generateOtp();
    const hashedPassword = await bcryptjs.hash(password, 10);

    const newAdmin = new Admin({
      username,
      email,
      password: hashedPassword,
      phone,
      otp: generatedOtp,
      otpExpires: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    await sendOtpEmail(email, generatedOtp);
    await newAdmin.save();
   const token=await generateToken(newAdmin);
   
    return res.status(200).json({ msg: "OTP sent to email" ,token,user: {
    username: newAdmin.username,
    email: newAdmin.email,
  }});
  } catch (error) {
    console.error("Error in /send-otp:", error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
});
// Register Business
router.post("/vendor-register", async (req, res) => {
  const {
    businessName,
    categoryName,
    startDate,
    currency,
    logo,
    website,
    phoneNumber,
    country,
    state,
    city,
    postalCode,
    companyDetails,
    username,
    email,
    facebookLink,
    instagramLink,
    linkedinLink,
    youtubeLink,
    twitterLink,
    password,
    confirmPassword,
    acceptTerms,
  } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ msg: "Passwords do not match" });
  }

  try {
    const vendorExist = await Vendor.findOne({ email });
    if (vendorExist) {
      return res.status(400).json({ msg: "Email already registered" });
    }

    // Hash the password
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Create a new Vendor with the hashed password
    const newVendor = new Vendor({
      businessName,
      categoryName,
      startDate,
      currency,
      logo,
      website,
      phoneNumber,
      country,
      state,
      city,
      postalCode,
      companyDetails,
      username,
      email,
      facebookLink,
      instagramLink,
      linkedinLink,
      youtubeLink,
      twitterLink,
      password: hashedPassword,
      confirmPassword: hashedPassword, // Store hashed password for confirmPassword
      acceptTerms,
    });

    const token = await generateToken(newVendor);
    await newVendor.save();

    return res.status(200).json({
      msg: "Vendor Registered Successfully",
      user: {
        id: newVendor._id,
        username: newVendor.username,
        email: newVendor.email,
      },
      token,
    });
  } catch (error) {
    return res.status(500).json({ msg: "Internal Server Error", error });
  }
});

// Login User
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the user by email in either Vendor or Admin collection
    const user =
      (await Vendor.findOne({ email })) || (await Admin.findOne({ email }));

    if (!user) {
      return res.status(404).json({ msg: "Email or password is incorrect" });
    }

    // Compare the provided password with the stored hashed password
    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ msg: "Password is incorrect" });
    }

    // Generate token (assuming you have a generateToken function)
    const token = await generateToken(user);

    return res.status(200).json({
      msg: "Login Successfully",
      user: { id: user._id, username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    return res.status(500).json({ msg: "Internal Server Error", error });
  }
});

// Get User Data (Protected Route)
router.get("/getUser", verifyToken, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    return res.status(200).json({
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (error) {
    return res.status(500).json({ msg: "Internal Server Error", error });
  }
});

// User profile update route
router.put("/updateUserProfile/:email", verifyToken, async (req, res) => {
  const { newEmail } = req.params;
  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcryptjs.hash(password, 10);

    const query = { newEmail };
    const update = {
      username,
      email,
      password: hashedPassword,
    };
    const options = { new: true, runValidators: true };

    const user =
      (await Vendor.findOneAndUpdate(query, update, options)) ||
      (await Admin.findOneAndUpdate(query, update, options));

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const token = await generateToken(user);
    return res.status(200).json({
      user: { id: user._id, username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    console.error("Error updating user profile:", error.message);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
});

const generateOtp = () => {
  const Otp = Math.floor(100000 + Math.random() * 900000).toString();
  return Otp;
};

function isValidEmail(email) {
  const regex =
    /^[a-zA-Z0-9._%+-]+@(?:gmail\.com|[a-zA-Z0-9.-]+\.(edu|org|com))$/;
  return regex.test(email);
}

module.exports = router;
