const requireRole = (...roles) => (req, res, next) => {
  const userRole = req.user?.role;
  if (!userRole || !roles.includes(userRole)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};

export default requireRole;
