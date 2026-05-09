const express = require("express");
const transactionController = require("../controllers/transactionController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.post(
  "/",
  identifier,
  transactionController.createTransaction,
);
router.get("/", identifier, transactionController.getTransactions);
router.get("/export", identifier, transactionController.exportTransactions);
router.patch(
  "/:id",
  identifier,
  transactionController.patchTransaction,
);
router.delete(
  "/:id",
  identifier,
  transactionController.deleteTransaction,
);

module.exports = router;
