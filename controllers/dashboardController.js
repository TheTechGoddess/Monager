const { getDashboardService } = require("../services/dashboardService");

exports.getDashboard = async (req, res) => {
  const { userId } = req.user;

  try {
    const dashboard = await getDashboardService(userId);
    res.json({
      success: true,
      ...dashboard,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
