const jwt = require("jsonwebtoken");
const Admin = require("../models/adminData/adminData");
const Vendor = require("../models/customerData/customerData");
const { log } = require("console");

const verifyToken = async (req, res, next) => {
  log("Verifying token...");
  try {
     const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Authorization token missing or invalid format" });
    }
     const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
      // log("Token verified successfully, user found:", user.email);
    const user =
      (await Admin.findById(decoded.id)) || (await Vendor.findById(decoded.id));
    if (!user) {
      console.log("Unauthorized User",user)
      return res.status(404).json({ msg: "Unauthorized User" });
      
    }
    req.user = user;
  
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      const token = req.headers.authorization.replace("Bearer ", "");
      const decoded = jwt.decode(token);
      const user =
        (await Admin.findById(decoded.id)) ||
        (await Vendor.findById(decoded.id));
      if (user) {
        user.tokens = user.tokens.filter((t) => t.token !== token);
        await user.save();
      }
      return res
        .status(401)
        .json({ msg: "Token Expired. Please log in again." });
    }else  {
      return res.status(401).json({ msg: "Invalid Token",token: error.message });
  }
}
};

module.exports = verifyToken;
