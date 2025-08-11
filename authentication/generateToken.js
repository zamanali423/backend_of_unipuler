const jwt = require("jsonwebtoken");

const generateToken = async (user) => {
  try {
    const expiresIn = 1; 
    const token = jwt.sign({ id: user._id }, process.env.SECRET_KEY, {
      expiresIn: `${expiresIn}d`,
    });
    user.tokens = user.tokens || [];
    user.tokens.push({ token });
    await user.save();
    return token;
  } catch (error) {
    return error;
  }
};

module.exports = generateToken;
