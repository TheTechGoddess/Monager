const jwt = require("jsonwebtoken");

exports.identifier = (req, res, next) => {
  let token;

  if (req.headers.client === "no-browser") {
    token = req.headers.authorization;
  } else {
    token = req.cookies["Authorization"];
  }

  if (!token || token.trim() === "") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  // Extract raw token
  const rawToken = token.replace(/^Bearer\s*/i, "").trim();

  try {
    const jwtVerified = jwt.verify(rawToken, process.env.TOKEN_SECRET);
    req.user = jwtVerified;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: "Invalid token" });
  }
};
