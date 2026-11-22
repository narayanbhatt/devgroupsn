/** Form checks. The database enforces the same rules; these give instant feedback. */

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const passwordProblem = (v: string): string | null =>
  v.length < 8 ? 'Use at least 8 characters.' : null;

/** Indian mobile number, with or without +91. */
export const isIndianMobile = (v: string) => /^(\+91[\s-]?)?[6-9]\d{9}$/.test(v.replace(/\s/g, ''));

/** 15-character GSTIN: 2-digit state code + PAN + entity + Z + checksum. */
export const isGstin = (v: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.trim().toUpperCase());

export const isPincode = (v: string) => /^[1-9][0-9]{5}$/.test(v.trim());

export const isOtp = (v: string) => /^\d{6}$/.test(v.trim());
