const express = require("express");
const categoryController = require("../controllers/categoryController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.post("/", identifier, categoryController.createCategory);
router.get("/", identifier, categoryController.getCategories);
router.patch(
  "/:id",
  identifier,
  categoryController.patchCategory,
);
router.delete(
  "/:id",
  identifier,
  categoryController.deleteCategory,
);

module.exports = router;
