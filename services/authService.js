const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/usersModel");
const { doHash, doHashValidation, hmacProcess } = require("../utils/hashing");
const { sendMail } = require("../middlewares/sendMail");
const {
  seedDefaultCategoriesForUserService,
} = require("./categoryService");
const {
  buildVerificationCodeEmail,
  buildForgotPasswordCodeEmail,
} = require("../utils/emailTemplates");

const TOKEN_EXPIRY = "8h";
const VERIFICATION_CODE_EXPIRY = 5 * 60 * 1000; // 5 minutes
const MAIL_TIMEOUT_MS = 15000;

const sendMailWithTimeout = async (mailOptions) => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Email service timeout."));
    }, MAIL_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      sendMail(mailOptions),
      timeoutPromise,
    ]);

    clearTimeout(timeoutId);

    return result;
  } catch (err) {
    clearTimeout(timeoutId);

    console.log("FULL EMAIL ERROR:", err);

    throw err;
  }
};

// ------------------ SIGNUP ------------------
exports.signupService = async ({
  first_name,
  last_name,
  phone_number,
  email,
  password,
}) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) throw new Error("User already exists!");

  const hashedPassword = await doHash(password, 12);

  const newUser = new User({
    first_name,
    last_name,
    phone_number,
    email,
    password: hashedPassword,
    active: true,
  });

  const savedUser = await newUser.save();
  await seedDefaultCategoriesForUserService(savedUser._id);
  const user = savedUser.toObject();
  delete user.password;

  return user;
};

// ------------------ LOGIN ------------------
exports.loginService = async (email, password) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new Error("User does not exist!");
  if (!user.active) throw new Error("Account disabled");

  const validPassword = await doHashValidation(password, user.password);
  if (!validPassword) throw new Error("Invalid credentials");
  if (!user.verified) throw new Error("Account is not verified");

  user.lastLogin = new Date();
  await user.save();

  const token = jwt.sign(
    {
      userId: user._id,
      email: user.email,
      verified: user.verified,
    },
    process.env.TOKEN_SECRET,
    { expiresIn: TOKEN_EXPIRY },
  );

  return { user, token };
};

// ------------------ LOGOUT ------------------
exports.logoutService = () => true; // no DB interaction needed

// ------------------ SEND VERIFICATION CODE ------------------
exports.sendVerificationCodeService = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User does not exist!");
  if (user.verified) throw new Error("You are already verified");

  const codeValue = crypto.randomInt(100000, 999999).toString();
  const emailTemplate = buildVerificationCodeEmail(codeValue);

  const info = await sendMailWithTimeout({
    from: process.env.RESEND_FROM_EMAIL,
    to: user.email,
    subject: "Verification Code",
    html: emailTemplate.html,
    text: emailTemplate.text,
  });

  if (info.accepted[0] !== user.email) {
    throw new Error("Code sending failed!");
  }

  user.verificationCode = hmacProcess(
    codeValue,
    process.env.HMAC_VERIFICATION_CODE_SECRET,
  );
  user.verificationCodeValidation = Date.now();
  await user.save();

  return true;
};

// ------------------ VERIFY VERIFICATION CODE ------------------
exports.verifyCodeService = async (email, providedCode) => {
  const user = await User.findOne({ email }).select(
    "+verificationCode +verificationCodeValidation",
  );
  if (!user) throw new Error("User does not exist!");
  if (user.verified) throw new Error("User already verified!");
  if (!user.verificationCode || !user.verificationCodeValidation)
    throw new Error("Wrong code!");
  if (Date.now() - user.verificationCodeValidation > VERIFICATION_CODE_EXPIRY)
    throw new Error("Code has expired!");

  const hashedCode = hmacProcess(
    providedCode.toString(),
    process.env.HMAC_VERIFICATION_CODE_SECRET,
  );

  if (hashedCode !== user.verificationCode)
    throw new Error("Invalid verification code");

  user.verified = true;
  user.verificationCode = undefined;
  user.verificationCodeValidation = undefined;
  await user.save();

  return true;
};

// ------------------ CHANGE PASSWORD ------------------
exports.changePasswordService = async (userId, oldPassword, newPassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new Error("User does not exist!");

  const validOld = await doHashValidation(oldPassword, user.password);
  if (!validOld) throw new Error("Old password is incorrect");

  const hashedNew = await doHash(newPassword, 12);
  user.password = hashedNew;
  user.passwordChangedAt = new Date();
  await user.save();

  return true;
};

// ------------------ FORGOT PASSWORD ------------------
exports.sendForgotPasswordCodeService = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User does not exist!");

  const codeValue = crypto.randomInt(100000, 999999).toString();
  const emailTemplate = buildForgotPasswordCodeEmail(codeValue);
  const info = await sendMailWithTimeout({
    from: process.env.RESEND_FROM_EMAIL,
    to: user.email,
    subject: "Verification Code for Forgot Password",
    html: emailTemplate.html,
    text: emailTemplate.text,
  });

  if (info.accepted[0] !== user.email) throw new Error("Code sending failed!");

  user.forgotPasswordCode = hmacProcess(
    codeValue,
    process.env.HMAC_VERIFICATION_CODE_SECRET,
  );
  user.forgotPasswordCodeValidation = Date.now();
  await user.save();

  return true;
};

exports.verifyForgotPasswordCodeService = async (
  email,
  providedCode,
  newPassword,
) => {
  const user = await User.findOne({ email }).select(
    "+forgotPasswordCode +forgotPasswordCodeValidation",
  );
  if (!user) throw new Error("User does not exist!");
  if (!user.forgotPasswordCode || !user.forgotPasswordCodeValidation)
    throw new Error("Wrong code!");
  if (Date.now() - user.forgotPasswordCodeValidation > VERIFICATION_CODE_EXPIRY)
    throw new Error("Code has expired!");

  const hashedCode = hmacProcess(
    providedCode.toString(),
    process.env.HMAC_VERIFICATION_CODE_SECRET,
  );
  if (hashedCode !== user.forgotPasswordCode) throw new Error("Invalid code");

  user.password = await doHash(newPassword, 12);
  user.forgotPasswordCode = undefined;
  user.forgotPasswordCodeValidation = undefined;
  user.passwordChangedAt = new Date();
  await user.save();

  return true;
};
