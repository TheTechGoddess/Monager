const Joi = require("joi");
const { CATEGORY_TYPES } = require("../utils/categoryMeta");

const passwordSchema = Joi.string()
  .min(8)
  .required()
  .pattern(/[a-z]/, { name: "lowercase" })
  .pattern(/\d/, { name: "digit" })
  .pattern(/[A-Z]/, { name: "uppercase" })
  .pattern(/[!@#$%^&*]/, { name: "special character" })
  .messages({
    "string.base": "Password must be a string.",
    "string.empty": "Password is required.",
    "string.min": "Password must be at least 8 characters long.",
    "string.pattern.name": "Password must contain at least one {#name}.",
    "any.required": "Password is required.",
  });

exports.signupSchema = Joi.object({
  first_name: Joi.string().trim().min(1).required(),
  last_name: Joi.string().trim().min(1).required(),
  phone_number: Joi.string().trim().min(1).required(),
  email: Joi.string()
    .min(6)
    .max(60)
    .required()
    .email({
      tlds: { allow: ["com", "net"] },
    }),

  password: passwordSchema,
});

exports.loginSchema = Joi.object({
  email: Joi.string()
    .min(6)
    .max(60)
    .required()
    .email({
      tlds: { allow: false },
    }),

  password: passwordSchema,
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
  newPassword: passwordSchema,
  oldPassword: passwordSchema,
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
  newPassword: passwordSchema,
});

exports.updateUserProfileSchema = Joi.object({
  first_name: Joi.string().trim().min(1),
  last_name: Joi.string().trim().min(1),
  currency: Joi.string().trim().min(1),
  timezone: Joi.string().trim().min(1),
  monthly_income: Joi.array()
    .items(
      Joi.object({
        company: Joi.string().trim().min(1).required(),
        income: Joi.number().required(),
      }),
    )
    .min(1),
  tax: Joi.number(),
  phone_number: Joi.string().trim().min(1),
})
  .min(1)
  .unknown(false);

exports.createCategorySchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  type: Joi.string()
    .valid(...CATEGORY_TYPES)
    .required(),
}).unknown(false);

exports.updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(1),
  type: Joi.string().valid(...CATEGORY_TYPES),
})
  .min(1)
  .unknown(false);

exports.createTransactionSchema = Joi.object({
  amount: Joi.number().required(),
  type: Joi.string()
    .valid(...CATEGORY_TYPES)
    .required(),
  category: Joi.string().trim().required(),
  description: Joi.string().trim().min(1).allow(null),
  date: Joi.date().required(),
  isRecurring: Joi.boolean(),
  recurringMode: Joi.string().valid("auto_create", "recommendation"),
  recurringFrequency: Joi.string().valid("weekly", "monthly"),
}).unknown(false);

exports.updateTransactionSchema = Joi.object({
  amount: Joi.number(),
  type: Joi.string().valid(...CATEGORY_TYPES),
  category: Joi.string().trim(),
  description: Joi.string().trim().min(1).allow(null),
  date: Joi.date(),
  isRecurring: Joi.boolean(),
  recurringMode: Joi.string().valid("auto_create", "recommendation"),
  recurringFrequency: Joi.string().valid("weekly", "monthly"),
})
  .min(1)
  .unknown(false);

exports.getTransactionsQuerySchema = Joi.object({
  month: Joi.number().integer().min(1).max(12),
  category: Joi.string().trim(),
  type: Joi.string().valid(...CATEGORY_TYPES),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  amountMin: Joi.number().min(0),
  amountMax: Joi.number().min(0),
  limit: Joi.number().integer().min(1).max(100),
  page: Joi.number().integer().min(1),
}).unknown(false);

exports.createBudgetSchema = Joi.object({
  category: Joi.string().trim().required(),
  limit: Joi.number().min(0).required(),
  month: Joi.alternatives()
    .try(
      Joi.number().integer().min(1).max(12),
      Joi.string()
        .trim()
        .lowercase()
        .valid(
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ),
    )
    .required(),
  year: Joi.number().integer().min(1970).required(),
}).unknown(false);

exports.updateBudgetSchema = Joi.object({
  category: Joi.string().trim(),
  limit: Joi.number().min(0),
  month: Joi.alternatives().try(
    Joi.number().integer().min(1).max(12),
    Joi.string()
      .trim()
      .lowercase()
      .valid(
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ),
  ),
  year: Joi.number().integer().min(1970),
})
  .min(1)
  .unknown(false);

exports.createRecurringTransactionSchema = Joi.object({
  amount: Joi.number().min(0).required(),
  category: Joi.string().trim().required(),
  frequency: Joi.string().valid("weekly", "monthly").required(),
  nextRunDate: Joi.date().required(),
  description: Joi.string().trim().min(1).allow(null),
  active: Joi.boolean(),
  mode: Joi.string().valid("auto_create", "recommendation"),
}).unknown(false);

exports.updateRecurringTransactionSchema = Joi.object({
  amount: Joi.number().min(0),
  category: Joi.string().trim(),
  frequency: Joi.string().valid("weekly", "monthly"),
  nextRunDate: Joi.date(),
  description: Joi.string().trim().min(1).allow(null),
  active: Joi.boolean(),
  mode: Joi.string().valid("auto_create", "recommendation"),
})
  .min(1)
  .unknown(false);

exports.monthlyReportQuerySchema = Joi.object({
  year: Joi.number().integer().min(1970),
}).unknown(false);

exports.categoryReportQuerySchema = Joi.object({
  month: Joi.number().integer().min(1).max(12),
  year: Joi.number().integer().min(1970),
}).unknown(false);

exports.transactionExportQuerySchema = Joi.object({
  format: Joi.string().valid("csv", "pdf").required(),
  month: Joi.number().integer().min(1).max(12),
  year: Joi.number().integer().min(1970),
  startMonth: Joi.number().integer().min(1).max(12),
  startYear: Joi.number().integer().min(1970),
  endMonth: Joi.number().integer().min(1).max(12),
  endYear: Joi.number().integer().min(1970),
}).unknown(false);

exports.submitRecurringRecommendationsSchema = Joi.object({
  recurringTransactionIds: Joi.array().items(Joi.string().trim()).min(1).required(),
  date: Joi.date(),
}).unknown(false);
