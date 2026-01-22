const isAdmin = (req, res) => {
  if (req.user.role === "admin") {
    return next();
  } else {
    res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = isAdmin;
