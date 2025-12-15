const jwt = require("jsonwebtoken");

exports.identifier = (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    else if (req.cookies && req.cookies.Authorization) {
      const cookieToken = req.cookies.Authorization;
      token = cookieToken.startsWith("Bearer ")
        ? cookieToken.split(" ")[1]
        : cookieToken;
    }

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized — Token missing" });
    }

    const decoded = jwt.verify(token, process.env.Secret_Token);

    if (!decoded || (!decoded.id && !decoded.userId)) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token payload" });
    }

    req.user = decoded;

    next();
  } catch (error) {
    console.error("❌ JWT Error:", error.message);

    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ success: false, message: "Token expired, please log in again" });
    }

    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token" });
    }

    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
