const express = require("express");
const budgetController = require("../controllers/budgetController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.post(
  "/",
  identifier,
  budgetController.createBudget,
);
router.get("/", identifier, budgetController.getBudgets);
router.patch(
  "/:id",
  identifier,
  budgetController.patchBudget,
);
router.delete(
  "/:id",
  identifier,
  budgetController.deleteBudget,
);

module.exports = router;
