const express = require("express");
const budgetController = require("../controllers/budgetController");
const { identifier } = require("../middlewares/identification");
const { financeWriteLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.post(
  "/",
  identifier,
  financeWriteLimiter,
  budgetController.createBudget,
);
router.get("/", identifier, budgetController.getBudgets);
router.patch(
  "/:id",
  identifier,
  financeWriteLimiter,
  budgetController.patchBudget,
);
router.delete(
  "/:id",
  identifier,
  financeWriteLimiter,
  budgetController.deleteBudget,
);

module.exports = router;
