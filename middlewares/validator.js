const Joi = require("joi");

exports.signupSchema = Joi.object({
  email: Joi.string()
    .min(6)
    .max(60)
    .required()
    .email({
      tlds: { allow: ["com", "net"] },
    }),

  password: Joi.string()
    .min(8)
    .required()
    .pattern(/[a-z]/, { name: "lowercase" })
    .pattern(/\d/, { name: "digit" })
    .messages({
      "string.base": "Password must be a string.",
      "string.empty": "Password is required.",
      "string.min": "Password must be at least 8 characters long.",
      "string.pattern.name": "Password must contain at least one {#name}.",
      "any.required": "Password is required.",
    }),
});

exports.loginSchema = Joi.object({
  email: Joi.string()
    .min(6)
    .max(60)
    .required()
    .email({
      tlds: { allow: ["com", "net"] },
    }),

  password: Joi.string()
    .min(8)
    .required()
    .pattern(/[a-z]/, { name: "lowercase" })
    .pattern(/\d/, { name: "digit" })
    .messages({
      "string.base": "Password must be a string.",
      "string.empty": "Password is required.",
      "string.min": "Password must be at least 8 characters long.",
      "string.pattern.name": "Password must contain at least one {#name}.",
      "any.required": "Password is required.",
    }),
});

exports.acceptCodeSchema = Joi.object({
  email: Joi.string()
    .min(6)
    .max(60)
    .required()
    .email({
      tlds: { allow: ["com", "net"] },
    }),

  providedCode: Joi.string()
    .length(6) // or whatever length you use
    .required(),
});

exports.changePasswordSchema = Joi.object({
  newPassword: Joi.string()
    .min(8)
    .required()
    .pattern(/[a-z]/, { name: "lowercase" })
    .pattern(/\d/, { name: "digit" })
    .messages({
      "string.base": "Password must be a string.",
      "string.empty": "Password is required.",
      "string.min": "Password must be at least 8 characters long.",
      "string.pattern.name": "Password must contain at least one {#name}.",
      "any.required": "Password is required.",
    }),
  oldPassword: Joi.string()
    .min(8)
    .required()
    .pattern(/[a-z]/, { name: "lowercase" })
    .pattern(/\d/, { name: "digit" })
    .messages({
      "string.base": "Password must be a string.",
      "string.empty": "Password is required.",
      "string.min": "Password must be at least 8 characters long.",
      "string.pattern.name": "Password must contain at least one {#name}.",
      "any.required": "Password is required.",
    }),
});

exports.acceptFPCodeSchema = Joi.object({
  email: Joi.string()
    .min(6)
    .max(60)
    .required()
    .email({
      tlds: { allow: ["com", "net"] },
    }),
  providedCode: Joi.string()
    .length(6) // or whatever length you use
    .required(),
  newPassword: Joi.string()
    .min(8)
    .required()
    .pattern(/[a-z]/, { name: "lowercase" })
    .pattern(/\d/, { name: "digit" })
    .messages({
      "string.base": "Password must be a string.",
      "string.empty": "Password is required.",
      "string.min": "Password must be at least 8 characters long.",
      "string.pattern.name": "Password must contain at least one {#name}.",
      "any.required": "Password is required.",
    }),
});

exports.createPostSchema = Joi.object({
  title: Joi.string().min(6).max(60).required(),
  description: Joi.string().min(6).max(600).required(),
  userId: Joi.string().required(),
});
