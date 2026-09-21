export function normalizeIsin(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidIsin(value: string) {
  const normalized = normalizeIsin(value);
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(normalized)) return false;

  const digits = [...normalized]
    .map((character) =>
      /\d/.test(character) ? character : String(character.charCodeAt(0) - 55),
    )
    .join("");
  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}
