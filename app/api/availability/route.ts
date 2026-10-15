import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const workshops = [
  "Christbaumkugeln",
  "Salben herstellen",
  "Karten gestalten",
  "Badekugeln",
];

type Registration = {
  workshop_slot1: string | null;
  workshop_slot2: string | null;
  workshop_slot1_status: string | null;
  workshop_slot2_status: string | null;
};

export async function GET() {
  try {
    const url = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) {
      throw new Error("Supabase-Serverkonfiguration fehlt.");
    }

    const supabase = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const counts = workshops.flatMap((workshop) =>
      ([1, 2] as const).map((slot) => ({
        workshop,
        slot,
        confirmed: 0,
        waitlist: 0,
      }))
    );

    // Supabase begrenzt Abfragen standardmässig auf 1000 Zeilen.
    // Deshalb werden die Datensätze seitenweise gezählt.
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("registrations")
        .select(
          "workshop_slot1,workshop_slot2,workshop_slot1_status,workshop_slot2_status"
        )
        .range(offset, offset + pageSize - 1);

      if (error) throw error;
      const rows = (data ?? []) as Registration[];

      for (const row of rows) {
        for (const slot of [1, 2] as const) {
          const workshop = slot === 1 ? row.workshop_slot1 : row.workshop_slot2;
          const status = slot === 1 ? row.workshop_slot1_status : row.workshop_slot2_status;
          const entry = counts.find((item) => item.workshop === workshop && item.slot === slot);
          if (!entry) continue;
          if (status === "waitlist") entry.waitlist++;
          else if (status === "confirmed" || status === null) entry.confirmed++;
        }
      }

      if (rows.length < pageSize) break;
    }

    return NextResponse.json({ availability: counts }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Fehler beim Laden der Workshopbelegung:", error);
    return NextResponse.json(
      { error: "Workshopbelegung konnte nicht geladen werden." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
