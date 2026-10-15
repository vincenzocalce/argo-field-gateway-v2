function validateVerifyToken(token) {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Configurazione non valida: VERIFY_TOKEN è obbligatorio e non può essere vuoto.");
  }
  // Validate without normalizing: Meta must supply the exact configured value.
  return token;
}

module.exports = { validateVerifyToken };
