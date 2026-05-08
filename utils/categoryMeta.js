const CATEGORY_TYPES = ["income", "expense", "investments"];

const CATEGORY_TYPE_ICON_MAP = {
  income: "banknote",
  expense: "receipt",
  investments: "chart-line",
};

const CATEGORY_TYPE_COLOR_MAP = {
  income: "#86BB75",
  expense: "#FB7185",
  investments: "#2E2357",
};

const resolveCategoryIcon = (type) => {
  const icon = CATEGORY_TYPE_ICON_MAP[type];
  if (!icon) throw new Error("Invalid category type");
  return icon;
};

const resolveCategoryColor = (type) => {
  const color = CATEGORY_TYPE_COLOR_MAP[type];
  if (!color) throw new Error("Invalid category type");
  return color;
};

module.exports = {
  CATEGORY_TYPES,
  CATEGORY_TYPE_ICON_MAP,
  CATEGORY_TYPE_COLOR_MAP,
  resolveCategoryIcon,
  resolveCategoryColor,
};
