const express = require("express");
const recurringTransactionController = require("../controllers/recurringTransactionController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.post(
  "/",
  identifier,
  recurringTransactionController.createRecurringTransaction,
);
router.get("/", identifier, recurringTransactionController.getRecurringTransactions);
router.get(
  "/recommendations",
  identifier,
  recurringTransactionController.getRecurringRecommendations,
);
router.post(
  "/recommendations/submit",
  identifier,
  recurringTransactionController.submitRecurringRecommendations,
);
router.delete(
  "/recommendations/:id",
  identifier,
  recurringTransactionController.dismissRecurringRecommendation,
);
router.patch(
  "/:id",
  identifier,
  recurringTransactionController.patchRecurringTransaction,
);
router.delete(
  "/:id",
  identifier,
  recurringTransactionController.deleteRecurringTransaction,
);

module.exports = router;
