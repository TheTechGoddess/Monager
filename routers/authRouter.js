const express = require("express");
const authController = require("../controllers/authController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

// authentication
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", identifier, authController.logout);

// email verification
router.patch("/send-verification-code", authController.sendVerificationCode);
router.patch(
  "/verify-verification-code",
  authController.verifyVerificationCode,
);

// password management
router.patch("/change-password", identifier, authController.changePassword);
router.patch(
  "/send-forgot-password-code",
  authController.sendForgotPasswordCode,
);
router.patch(
  "/verify-forgot-password-code",
  authController.verifyForgotPasswordCode,
);

module.exports = router;
