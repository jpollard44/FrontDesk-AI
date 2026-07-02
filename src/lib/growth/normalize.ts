// Normalization used for cross-run deduplication. Rule order mirrors the
// system design: phone match (strongest) → business name + city → email.

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Treat US numbers with and without country code as the same line.
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

const NAME_NOISE =
  /\b(llc|inc|pllc|pc|pa|ltd|llp|dds|dmd|md|do|esq|the|of|and|&|corp|co)\b/g;

export function normalizeBusinessName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}
