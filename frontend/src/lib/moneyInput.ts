/**
 * Read a required amount typed into a form field.
 * `Number("")` is 0, so a blank box would silently save ₨0. This rejects blank,
 * non-numeric and negative input with a message naming the field.
 * Type 0 explicitly when a field really is free.
 */
export function requiredAmount(raw: string | number | null | undefined, label: string, max?: number): number {
  const text = String(raw ?? "").trim();
  if (text === "") throw new Error(`Enter the ${label}. Type 0 if there is no charge.`);
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`The ${label} must be a number.`);
  if (value < 0) throw new Error(`The ${label} cannot be negative.`);
  if (max !== undefined && value > max) throw new Error(`The ${label} cannot be more than ${max}.`);
  return value;
}
