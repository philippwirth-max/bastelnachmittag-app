import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Diese Route läuft ausschliesslich auf dem Server. Keine Secrets an den Browser geben.
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    // Fremde Webseiten dürfen keine Anmeldungen im Namen der Besucher auslösen.
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Anfrage nicht erlaubt." }, { status: 403, headers });
    }
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "JSON erwartet." }, { status: 415, headers });
    }

    // Nur kleine Formulardaten akzeptieren.
    const raw = await request.text();
    if (raw.length > 30000) {
      return NextResponse.json({ error: "Anmeldung zu gross." }, { status: 413, headers });
    }
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Ungültige Anmeldedaten." }, { status: 400, headers });
    }
    const payload = body as Record<string, unknown>;
    const { parentName, email, phone, children } = payload;
    if (
      typeof parentName !== "string" ||
      typeof email !== "string" ||
      typeof phone !== "string" ||
      !Array.isArray(children) ||
      children.length < 1 ||
      children.length > 30 ||
      !children.every((child) =>
        child && typeof child === "object" && !Array.isArray(child) &&
        ["firstName", "lastName", "birthDate", "companion", "slot1", "slot2"].every(
          (field) => typeof (child as Record<string, unknown>)[field] === "string"
        )
      )
    ) {
      return NextResponse.json({ error: "Anmeldedaten unvollständig." }, { status: 400, headers });
    }

    const url = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("Serverkonfiguration fehlt.");
    const supabase = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.rpc("book_workshop_family", {
      p_parent_name: parentName,
      p_email: email,
      p_phone: phone,
      p_children: children,
    });
    if (error) {
      console.error("Buchung abgelehnt:", error);
      return NextResponse.json({ error: "Anmeldung konnte nicht gespeichert werden. Bitte Angaben prüfen oder später erneut versuchen." }, { status: 400, headers });
    }
    return NextResponse.json(data, { status: 200, headers });
  } catch (error) {
    console.error("Fehler bei der Anmeldung:", error);
    return NextResponse.json({ error: "Anmeldung konnte nicht verarbeitet werden." }, { status: 500, headers });
  }
}
