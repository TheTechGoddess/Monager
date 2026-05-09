const User = require("../models/usersModel");
const Category = require("../models/categoriesModel");
const RecurringTransaction = require("../models/recurringTransactionsModel");
const {
  resolveCategoryIcon,
  resolveCategoryColor,
} = require("../utils/categoryMeta");

const PATCHABLE_FIELDS = [
  "first_name",
  "last_name",
  "currency",
  "timezone",
  "monthly_income",
  "tax",
  "phone_number",
];
const MAX_PROFILE_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const SETTINGS_INCOME_SIGNATURE_PREFIX = "settings-income:";
const SETTINGS_TAX_SIGNATURE = "settings-tax";

const getNextMonthlyRunDate = () => {
  const now = new Date();
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const day = now.getUTCDate();
  const lastDay = new Date(
    Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), Math.min(day, lastDay)),
  );
};

const ensureUserCategoryByNameAndType = async (userId, name, type) => {
  const existing = await Category.findOne({
    userId,
    type,
    name: { $regex: `^${String(name).trim()}$`, $options: "i" },
  });
  if (existing) return existing;

  return Category.create({
    userId,
    name,
    type,
    icon: resolveCategoryIcon(type),
    color: resolveCategoryColor(type),
  });
};

const syncMonthlyIncomeRecurring = async (userId, monthlyIncome = []) => {
  const salaryCategory = await ensureUserCategoryByNameAndType(
    userId,
    "Salary",
    "income",
  );
  const nextRunDate = getNextMonthlyRunDate();

  const activeSignatures = [];
  for (const item of monthlyIncome) {
    const company = String(item.company || "").trim();
    const amount = Number(item.income);
    if (!company || !Number.isFinite(amount) || amount <= 0) continue;

    const signature = `${SETTINGS_INCOME_SIGNATURE_PREFIX}${company.toLowerCase()}`;
    activeSignatures.push(signature);

    await RecurringTransaction.findOneAndUpdate(
      { userId, signature },
      {
        $set: {
          amount,
          category: salaryCategory._id,
          frequency: "monthly",
          nextRunDate,
          description: `Income source: ${company}`,
          active: true,
          mode: "auto_create",
          autoDetected: false,
          signature,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  const deactivateFilter = {
    userId,
    signature: { $regex: `^${SETTINGS_INCOME_SIGNATURE_PREFIX}` },
  };
  if (activeSignatures.length) {
    deactivateFilter.$and = [{ signature: { $nin: activeSignatures } }];
  }

  await RecurringTransaction.updateMany(deactivateFilter, {
    $set: { active: false },
  });
};

const syncTaxRecurring = async (userId, tax) => {
  const nextRunDate = getNextMonthlyRunDate();
  const amount = Number(tax);

  if (!Number.isFinite(amount) || amount <= 0) {
    await RecurringTransaction.updateMany(
      { userId, signature: SETTINGS_TAX_SIGNATURE },
      { $set: { active: false } },
    );
    return;
  }

  const taxCategory = await ensureUserCategoryByNameAndType(
    userId,
    "Taxes",
    "expense",
  );

  await RecurringTransaction.findOneAndUpdate(
    { userId, signature: SETTINGS_TAX_SIGNATURE },
    {
      $set: {
        amount,
        category: taxCategory._id,
        frequency: "monthly",
        nextRunDate,
        description: "Monthly tax payment",
        active: true,
        mode: "auto_create",
        autoDetected: false,
        signature: SETTINGS_TAX_SIGNATURE,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

exports.getCurrentUserService = async (userId) => {
  const user = await User.findById(userId).select(
    "+profile_image +profile_image_mime_type +profile_image_size",
  );
  if (!user) throw new Error("User does not exist!");

  const userObject = user.toObject();
  userObject.profile_image = userObject.profile_image
    ? userObject.profile_image.toString("base64")
    : null;

  return userObject;
};

exports.updateCurrentUserService = async (userId, payload) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User does not exist!");

  const payloadKeys = Object.keys(payload);
  if (!payloadKeys.length) throw new Error("No fields provided for update");

  const invalidFields = payloadKeys.filter(
    (field) => !PATCHABLE_FIELDS.includes(field),
  );
  if (invalidFields.length) {
    throw new Error(`Unsupported field(s): ${invalidFields.join(", ")}`);
  }

  payloadKeys.forEach((field) => {
    user[field] = payload[field];
  });

  await user.save();

  if (Object.prototype.hasOwnProperty.call(payload, "monthly_income")) {
    await syncMonthlyIncomeRecurring(userId, payload.monthly_income || []);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "tax")) {
    await syncTaxRecurring(userId, payload.tax);
  }

  return user;
};

exports.uploadProfileImageService = async (
  userId,
  imageBuffer,
  mimeType = "application/octet-stream",
) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User does not exist!");

  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
    throw new Error("Profile image binary payload is required");
  }

  if (imageBuffer.length > MAX_PROFILE_IMAGE_SIZE_BYTES) {
    const error = new Error("Profile image size exceeds 2MB limit");
    error.statusCode = 413;
    throw error;
  }

  user.profile_image = imageBuffer;
  user.profile_image_mime_type = mimeType;
  user.profile_image_size = imageBuffer.length;

  await user.save();

  return {
    profile_image_size: user.profile_image_size,
    profile_image_mime_type: user.profile_image_mime_type,
  };
};
