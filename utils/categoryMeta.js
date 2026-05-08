const CATEGORY_TYPES = ["income", "expense", "investments"];

const CATEGORY_TYPE_ICON_MAP = {
  income: "banknote",
  expense: "receipt",
  investments: "chart-line",
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

const normalizeHexColor = (colorValue) => {
  if (colorValue === null || colorValue === undefined) return null;

  const normalized = String(colorValue).trim();
  if (!normalized) return null;

  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new Error("Category color must be a valid hex value");
  }

  return normalized;
};

const generateRandomHexColor = () => {
  const randomColor = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `#${randomColor}`;
};

const resolveCategoryIcon = (type) => {
  const icon = CATEGORY_TYPE_ICON_MAP[type];
  if (!icon) throw new Error("Invalid category type");
  return icon;
};

module.exports = {
  CATEGORY_TYPES,
  CATEGORY_TYPE_ICON_MAP,
  HEX_COLOR_PATTERN,
  normalizeHexColor,
  generateRandomHexColor,
  resolveCategoryIcon,
};
