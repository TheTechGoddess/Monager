const { hash, compare } = require("bcryptjs");
const { createHmac } = require("crypto");

exports.doHash = (value, saltValue) => {
  const response = hash(value, saltValue);
  return response;
};

exports.doHashValidation = (value, hashedValue) => {
  const response = compare(value, hashedValue);
  return response;
};

exports.hmacProcess = (value, key) => {
  const response = createHmac("sha256", key).update(value).digest("hex");
  return response;
};
