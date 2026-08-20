const TRIVIAL_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "password",
  "password123",
  "admin123",
  "admin1234",
  "maxiofertas",
  "maxiofertas123",
  "qwerty123",
  "qwertyuiop",
]);

export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
}

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  if (!password || typeof password !== "string") {
    return { valid: false, message: "La contraseña es requerida." };
  }

  if (password.length < 8) {
    return {
      valid: false,
      message: "La contraseña debe tener al menos 8 caracteres.",
    };
  }

  if (password.length > 128) {
    return {
      valid: false,
      message: "La contraseña no debe exceder 128 caracteres.",
    };
  }

  if (TRIVIAL_PASSWORDS.has(password.toLowerCase())) {
    return {
      valid: false,
      message: "La contraseña elegida es demasiado predecible o trivial. Por favor utiliza una m?s segura.",
    };
  }

  return { valid: true };
}
