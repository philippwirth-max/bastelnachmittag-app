import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type Child = {
  firstName: string;
  lastName: string;
  birthDate: string;
  companion: string;
  slot1: string;
  slot2: string;
};

type BookedChild = {
  firstName: string;
  lastName: string;
  slot1Status: "confirmed" | "waitlist";
  slot2Status: "confirmed" | "waitlist";
};

type MailStatus = "accepted" | "failed" | "not_configured";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

function statusText(status: "confirmed" | "waitlist"): string {
  return status === "waitlist" ? "Warteliste" : "Bestätigt";
}

async function sendConfirmationEmail(
  parentName: string,
  recipient: string,
  children: Child[],
  bookedChildren: BookedChild[]
): Promise<MailStatus> {
  // Ausschliesslich serverseitige Umgebungsvariablen verwenden.
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const sender = process.env.MICROSOFT_SENDER_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !sender) {
    console.error("E-Mail nicht eingerichtet: Eine Microsoft-Umgebungsvariable fehlt.");
    return "not_configured";
  }

  if (bookedChildren.length !== children.length) {
    console.error("E-Mail nicht gesendet: Anzahl der Buchungsergebnisse stimmt nicht.");
    return "failed";
  }

  const rows = children.map((child, index) => {
    const booked = bookedChildren[index];
    if (
      !booked ||
      !["confirmed", "waitlist"].includes(booked.slot1Status) ||
      !["confirmed", "waitlist"].includes(booked.slot2Status)
    ) {
      throw new Error("Buchungsergebnis ohne gültigen Status.");
    }

    const companionRow = child.companion.trim()
      ? `<p style="margin:6px 0 0;color:#58695e;font-size:13px">Begleitperson: ${escapeHtml(child.companion)}</p>`
      : "";

    return `
      <div style="border:1px solid #dfe9e1;border-radius:12px;padding:16px;margin:14px 0;background:#fff">
        <p style="margin:0 0 10px;font-size:17px;font-weight:700;color:#244a37">${escapeHtml(child.firstName)} ${escapeHtml(child.lastName)}</p>
        <p style="margin:5px 0">Zeitfenster 1: <strong>${escapeHtml(child.slot1)}</strong> – ${statusText(booked.slot1Status)}</p>
        <p style="margin:5px 0">Zeitfenster 2: <strong>${escapeHtml(child.slot2)}</strong> – ${statusText(booked.slot2Status)}</p>
        ${companionRow}
      </div>`;
  }).join("");

  const hasWaitlist = bookedChildren.some(
    (child) => child.slot1Status === "waitlist" || child.slot2Status === "waitlist"
  );

  const content = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#26372d;line-height:1.6">
    <div style="max-width:620px;margin:0 auto;background:white;padding:28px;border-radius:16px">
      <h1 style="color:#286046;font-size:27px;margin-top:0">Adventsbasteln</h1>
      <p>Hallo ${escapeHtml(parentName)}</p>
      <p>Vielen Dank für deine Anmeldung! Hier findest du die Übersicht der angemeldeten Kinder und ihrer Workshopplätze:</p>
      ${rows}
      ${hasWaitlist
        ? `<p style="padding:12px 14px;background:#fff3df;border-radius:10px"><strong>Hinweis zur Warteliste:</strong> Bei mindestens einem Workshop besteht noch keine feste Platzzusage. Wir melden uns, falls ein Platz frei wird.</p>`
        : `<p style="padding:12px 14px;background:#e9f5eb;border-radius:10px">Alle oben aufgeführten Workshopplätze sind bestätigt.</p>`}
      <p>Wir freuen uns auf einen kreativen Nachmittag!</p>
      <p>Herzliche Grüsse<br />Das Adventsbasteln-Team</p>
      <p style="border-top:1px solid #e2e9e2;padding-top:14px;color:#6a776e;font-size:12px">Dies ist eine automatische Anmeldebestätigung. Bitte antworte bei Fragen an die Absenderadresse.</p>
    </div>
  </body></html>`;

  try {
    // Microsoft Graph mit App-Berechtigung Mail.Send (Application).
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!tokenResponse.ok) {
      // Nur den OAuth-Fehlertyp und die AADSTS-Nummer protokollieren.
      // Niemals die vollständige Microsoft-Antwort, Geheimnisse oder Tokens loggen.
      const responseText = await tokenResponse.text();
      let oauthError = "unbekannt";
      try {
        const parsed: unknown = JSON.parse(responseText);
        if (parsed && typeof parsed === "object" && "error" in parsed) {
          const value = (parsed as { error?: unknown }).error;
          if (typeof value === "string" && /^[a-z_]{1,60}$/i.test(value)) {
            oauthError = value;
          }
        }
      } catch {
        // Keine JSON-Antwort: Es wird ausschliesslich der HTTP-Status geloggt.
      }
      const aadstsCode = responseText.match(/AADSTS\d{5,9}/)?.[0] ?? "nicht angegeben";
      console.error("Microsoft-Token abgelehnt:", {
        httpStatus: tokenResponse.status,
        oauthError,
        aadstsCode,
      });
      return "failed";
    }

    const tokenJson: unknown = await tokenResponse.json();
    const accessToken =
      tokenJson && typeof tokenJson === "object" && "access_token" in tokenJson
        ? (tokenJson as { access_token?: unknown }).access_token
        : undefined;
    if (typeof accessToken !== "string" || !accessToken) {
      console.error("Microsoft-Token fehlt in der Antwort.");
      return "failed";
    }

    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: "Deine Anmeldung zum Adventsbasteln",
            body: { contentType: "HTML", content },
            toRecipients: [{ emailAddress: { address: recipient } }],
          },
          saveToSentItems: true,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!graphResponse.ok) {
      console.error("Microsoft Graph hat den E-Mail-Versand abgelehnt. HTTP:", graphResponse.status);
      return "failed";
    }
    // HTTP 202 bedeutet: Microsoft hat die E-Mail zum Versand angenommen,
    // nicht, dass die Zustellung beim Empfänger bereits bestätigt ist.
    return "accepted";
  } catch (error) {
    console.error("Microsoft-E-Mail-Versand fehlgeschlagen:", error);
    return "failed";
  }
}

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Anfrage nicht erlaubt." }, { status: 403, headers });
    }
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "JSON erwartet." }, { status: 415, headers });
    }

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
      return NextResponse.json(
        { error: "Anmeldung konnte nicht gespeichert werden. Bitte Angaben prüfen oder später erneut versuchen." },
        { status: 400, headers }
      );
    }

    // Ab hier ist die Anmeldung bereits gespeichert. Ein E-Mail-Fehler
    // darf NIEMALS zu einer zweiten Buchung oder einer Fehlermeldung
    // über eine angeblich gescheiterte Anmeldung führen.
    let emailStatus: MailStatus = "failed";
    try {
      const resultChildren =
        data && typeof data === "object" && !Array.isArray(data) && "children" in data
          ? (data as { children?: unknown }).children
          : undefined;
      if (!Array.isArray(resultChildren)) {
        console.error("Buchungsdaten ohne Kind-Status. Keine E-Mail gesendet.");
      } else {
        emailStatus = await sendConfirmationEmail(
          parentName as string,
          email as string,
          children as Child[],
          resultChildren as BookedChild[]
        );
      }
    } catch (mailError) {
      console.error("Bestätigungs-E-Mail fehlgeschlagen:", mailError);
    }

    return NextResponse.json({ ...(data as Record<string, unknown>), emailStatus }, { status: 200, headers });
  } catch (error) {
    console.error("Fehler bei der Anmeldung:", error);
    return NextResponse.json({ error: "Anmeldung konnte nicht verarbeitet werden." }, { status: 500, headers });
  }
}
