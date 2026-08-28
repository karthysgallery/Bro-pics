export function isValidPaise(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function assertPaise(value: number, fieldName: string): number {
  if (!isValidPaise(value)) {
    throw new Error(`${fieldName} must be a non-negative integer (paise), got ${value}`);
  }
  return value;
}
