const Transaction = require("../models/transactionsModel");
const mongoose = require("mongoose");
const { createNotificationService } = require("./notificationService");

exports.getMonthlyReportService = async (userId, { year } = {}) => {
  const now = new Date();
  const reportYear = Number(year) || now.getUTCFullYear();
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const monthly = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type: "expense",
        $expr: { $eq: [{ $year: "$date" }, reportYear] },
      },
    },
    {
      $group: {
        _id: { month: { $month: "$date" } },
        total: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.month": 1 } },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        total: 1,
      },
    },
  ]);

  await createNotificationService({
    userId,
    title: "Monthly report ready",
    message: `Your monthly expense report for ${reportYear} is ready.`,
    type: "monthly_report_ready",
    dedupeKey: `monthly-report:${userId}:${reportYear}`,
  });

  return monthly;
};

exports.getCategoryReportService = async (userId, { month, year } = {}) => {
  const match = {
    userId: new mongoose.Types.ObjectId(userId),
    type: "expense",
  };

  if (month) {
    match.$expr = {
      $and: [
        { $eq: [{ $month: "$date" }, Number(month)] },
        {
          $eq: [
            { $year: "$date" },
            Number(year) || new Date().getUTCFullYear(),
          ],
        },
      ],
    };
  } else if (year) {
    match.$expr = {
      $eq: [{ $year: "$date" }, Number(year)],
    };
  }

  return Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$category",
        total: { $sum: "$amount" },
      },
    },
    { $sort: { total: -1 } },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: "$category._id",
        category: "$category.name",
        total: 1,
      },
    },
  ]);
};
