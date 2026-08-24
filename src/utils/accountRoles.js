const getAccountRoles = (user) => {
  if (Array.isArray(user?.roles) && user.roles.length) return user.roles;
  if (user?.role === "recruiter") return ["company"];
  if (user?.role === "admin") return ["admin"];
  return ["employee", "freelancer"];
};

const hasAccountRole = (user, role) => getAccountRoles(user).includes(role);

const assertAccountRole = (user, role, ApiError, httpStatus, message) => {
  if (!hasAccountRole(user, role) && !getAccountRoles(user).includes("admin")) {
    throw new ApiError(httpStatus.FORBIDDEN, message || `${role} account required`);
  }
};

module.exports = { getAccountRoles, hasAccountRole, assertAccountRole };
