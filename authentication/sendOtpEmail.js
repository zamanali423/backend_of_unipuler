const nodemailer = require("nodemailer");

// Function to send OTP email
async function sendOtpEmail(toEmail, otpCode) {
  try {
    // Create transporter using SMTP (e.g., Gmail)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.APP_EMAIL, // Replace with your email
        pass: process.env.APP_PASSWORD, // Replace with your app-specific password
      },
    });

    // Email options
    const mailOptions = {
      from:`Unipuller ${process.env.APP_EMAIL}`,
      to: toEmail,
      subject: "Your OTP Code",
      html:` <h3>Your OTP is: <b>${otpCode}</b></h3><p>It is valid for 5 minutes.</p>`,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("OTP Email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending OTP Email:", error);
    return false;
  }
}

module.exports = sendOtpEmail;