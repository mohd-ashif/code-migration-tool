export function validateEmail(email: any): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) && trimmed.length <= 255;
}

export function validatePassword(password: any): boolean {
  if (typeof password !== "string") return false;
  // Min 8 characters, at least 1 uppercase, 1 lowercase, 1 number
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function validateRegisterRequest(body: any): string[] {
  const errors: string[] = [];
  if (!body) {
    errors.push("Request body is missing.");
    return errors;
  }
  if (!validateEmail(body.email)) {
    errors.push("A valid email address is required.");
  }
  if (!validatePassword(body.password)) {
    errors.push(
      "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number."
    );
  }
  return errors;
}

export function validateLoginRequest(body: any): string[] {
  const errors: string[] = [];
  if (!body) {
    errors.push("Request body is missing.");
    return errors;
  }
  if (!validateEmail(body.email)) {
    errors.push("A valid email address is required.");
  }
  if (!body.password || typeof body.password !== "string" || body.password.length === 0) {
    errors.push("Password is required.");
  }
  return errors;
}

export function validateForgotPasswordRequest(body: any): string[] {
  const errors: string[] = [];
  if (!body) {
    errors.push("Request body is missing.");
    return errors;
  }
  if (!validateEmail(body.email)) {
    errors.push("A valid email address is required.");
  }
  return errors;
}

export function validateResetPasswordRequest(body: any): string[] {
  const errors: string[] = [];
  if (!body) {
    errors.push("Request body is missing.");
    return errors;
  }
  if (!body.token || typeof body.token !== "string" || body.token.trim().length === 0) {
    errors.push("Reset token is required.");
  }
  if (!validatePassword(body.password)) {
    errors.push(
      "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number."
    );
  }
  return errors;
}
