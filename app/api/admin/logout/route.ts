import { clearAdminSessionCookie } from "../../../lib/adminAccess";

export async function POST(request: Request) {
  const response = Response.redirect(new URL("/admin", request.url), 303);
  response.headers.set("set-cookie", clearAdminSessionCookie());
  response.headers.set("cache-control", "no-store");
  return response;
}
