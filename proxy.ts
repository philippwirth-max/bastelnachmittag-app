import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const authHeader =
    request.headers.get("authorization");

  if (authHeader) {
    const [scheme, encoded] =
      authHeader.split(" ");

    if (
      scheme === "Basic" &&
      encoded
    ) {
      try {
        const decoded =
          atob(encoded);

        const colonIndex =
          decoded.indexOf(":");

        if (
          colonIndex !== -1
        ) {
          const username =
            decoded.substring(
              0,
              colonIndex
            );

          const password =
            decoded.substring(
              colonIndex + 1
            );

          const adminUser =
            process.env.ADMIN_USER;

          const adminPassword =
            process.env.ADMIN_PASSWORD;

          if (
            adminUser &&
            adminPassword &&
            username === adminUser &&
            password === adminPassword
          ) {
            return NextResponse.next();
          }
        }
      } catch {
        // Ungültiger Authorization-Header
      }
    }
  }

  return new NextResponse(
    "Admin-Anmeldung erforderlich.",
    {
      status: 401,
      headers: {
        "WWW-Authenticate":
          'Basic realm="Bastelnachmittag Admin", charset="UTF-8"',
        "Cache-Control":
          "no-store",
      },
    }
  );
}

export const config = {
  matcher: [
    "/admin/:path*",
  ],
};