const {
  getMonthlyReportService,
  getCategoryReportService,
} = require("../services/reportService");
const {
  monthlyReportQuerySchema,
  categoryReportQuerySchema,
} = require("../middlewares/validator");

exports.getMonthlyReport = async (req, res) => {
  const { userId } = req.user;

  try {
    const { error } = monthlyReportQuerySchema.validate(req.query);
    if (error) throw new Error(error.details[0].message);

    const report = await getMonthlyReportService(userId, req.query);
    res.json({
      success: true,
      report,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getCategoryReport = async (req, res) => {
  const { userId } = req.user;

  try {
    const { error } = categoryReportQuerySchema.validate(req.query);
    if (error) throw new Error(error.details[0].message);

    const report = await getCategoryReportService(userId, req.query);
    res.json({
      success: true,
      report,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
