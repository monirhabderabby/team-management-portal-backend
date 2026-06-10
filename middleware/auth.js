import { verifyToken } from "../utils/token.js";
import User from "../models/User.js";
import { EMPLOYEE_STATUS } from "../config/constants.js";

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (user.status === EMPLOYEE_STATUS.INACTIVE) {
      return res.status(403).json({
        message: "Account inactive. Please contact project manager or team leader.",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export default auth;
