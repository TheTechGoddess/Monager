// controllers/authController.js
const {
  signupService,
  loginService,
  logoutService,
  sendVerificationCodeService,
  verifyCodeService,
  changePasswordService,
  sendForgotPasswordCodeService,
  verifyForgotPasswordCodeService,
} = require("../services/authService");
const {
  signupSchema,
  loginSchema,
  acceptCodeSchema,
  changePasswordSchema,
  acceptFPCodeSchema,
} = require("../middlewares/validator");

// ------------------ SIGNUP ------------------
exports.signup = async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    await signupService(value);

    res.status(201).json({
      success: true,
      message: "Your account has been created successfully",
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ------------------ LOGIN ------------------
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const { error } = loginSchema.validate({ email, password });
    if (error) throw new Error(error.details[0].message);

    const { user, token } = await loginService(email, password);

    res.cookie("Authorization", "Bearer " + token, {
      expires: new Date(Date.now() + 8 * 3600000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.json({ success: true, message: "Logged in successfully", token });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
};

// ------------------ LOGOUT ------------------
exports.logout = async (req, res) => {
  await logoutService();
  res.clearCookie("Authorization").json({ success: true, message: "Logged out successfully" });
};

// ------------------ SEND VERIFICATION CODE ------------------
exports.sendVerificationCode = async (req, res) => {
  const { email } = req.body;
  try {
    await sendVerificationCodeService(email);
    res.json({
      success: true,
      message: "Verification code sent successfully. Please check your email.",
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ------------------ VERIFY CODE ------------------
exports.verifyVerificationCode = async (req, res) => {
  try {
    const { email, providedCode } = req.body;
    const { error } = acceptCodeSchema.validate({ email, providedCode });
    if (error) throw new Error(error.details[0].message);

    await verifyCodeService(email, providedCode);

    res.status(200).json({ success: true, message: "Your account has been verified!" });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// ------------------ CHANGE PASSWORD ------------------
exports.changePassword = async (req, res) => {
  const { userId } = req.user;
  const { oldPassword, newPassword } = req.body;
  try {
    const { error } = changePasswordSchema.validate({ oldPassword, newPassword });
    if (error) throw new Error(error.details[0].message);

    await changePasswordService(userId, oldPassword, newPassword);
    res.json({ success: true, message: "Password updated!" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ------------------ FORGOT PASSWORD ------------------
exports.sendForgotPasswordCode = async (req, res) => {
  const { email } = req.body;
  try {
    await sendForgotPasswordCodeService(email);
    res.json({
      success: true,
      message: "Password reset code sent successfully. Please check your email.",
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyForgotPasswordCode = async (req, res) => {
  const { email, providedCode, newPassword } = req.body;
  try {
    const { error } = acceptFPCodeSchema.validate({ email, providedCode, newPassword });
    if (error) throw new Error(error.details[0].message);

    await verifyForgotPasswordCodeService(email, providedCode, newPassword);
    res.json({ success: true, message: "Password updated!" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};