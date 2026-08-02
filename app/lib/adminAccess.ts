export function getAdminEmails(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminRequest(headers: Headers, configuredEmails: string | undefined) {
  const userId = headers.get("oai-authenticated-user-id")?.trim();
  const userEmail = headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!userId || !userEmail) return false;
  return getAdminEmails(configuredEmails).has(userEmail);
}

export function getAuthenticatedEmail(headers: Headers) {
  return headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? null;
}
