export function getAdminEmails(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminRequest(headers: Headers, configuredEmails: string | undefined) {
  const userEmail = getAuthenticatedEmail(headers);
  if (!userEmail) return false;
  return getAdminEmails(configuredEmails).has(userEmail);
}

export function getAuthenticatedEmail(headers: Headers) {
  const openAiUserId = headers.get("oai-authenticated-user-id")?.trim();
  const openAiEmail = headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (openAiUserId && openAiEmail) return openAiEmail;

  const accessJwt = headers.get("cf-access-jwt-assertion")?.trim();
  const accessEmail = headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (accessJwt && accessEmail) return accessEmail;

  return null;
}
