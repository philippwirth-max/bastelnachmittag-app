import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export const instant = false;

const workshops = [
  "Christbaumkugeln",
  "Salben herstellen",
  "Karten gestalten",
  "Badekugeln",
];

type Registration = {
  id: number | string;
  parent_name: string | null;
  email: string | null;
  phone: string | null;
  child_name: string | null;
  child_last_name: string | null;
  birth_date: string | null;
  companion: string | null;
  workshop_slot1: string | null;
  workshop_slot2: string | null;
  workshop_slot1_status: string | null;
  workshop_slot2_status: string | null;
  created_at?: string | null;
};

type Capacity = {
  workshop: string;
  slot: 1 | 2;
  maxPlaces: number;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "SUPABASE_URL oder SUPABASE_SECRET_KEY fehlt."
    );
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

function normalizeWorkshop(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeSlot(
  value: unknown
): 1 | 2 | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    text === "1" ||
    text === "slot1" ||
    text === "slot 1" ||
    text === "zeitfenster 1"
  ) {
    return 1;
  }

  if (
    text === "2" ||
    text === "slot2" ||
    text === "slot 2" ||
    text === "zeitfenster 2"
  ) {
    return 2;
  }

  return null;
}

function formatDate(value: string | null) {
  if (!value) {
    return "–";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function statusLabel(value: string | null) {
  return value === "waitlist"
    ? "Warteliste"
    : "Bestätigt";
}

async function updateRegistration(
  formData: FormData
) {
  "use server";

  const supabase = getSupabaseAdmin();

  const id = formData.get("id");

  if (!id) {
    throw new Error("ID fehlt.");
  }

  const child_name = String(formData.get("child_name") ?? "").trim();
  const child_last_name = String(formData.get("child_last_name") ?? "").trim();
  const birth_date = String(formData.get("birth_date") ?? "");
  const companion = String(formData.get("companion") ?? "").trim();
  const slot1 = String(formData.get("workshop_slot1") ?? "");
  const slot2 = String(formData.get("workshop_slot2") ?? "");
  const status1 = String(formData.get("workshop_slot1_status") ?? "confirmed");
  const status2 = String(formData.get("workshop_slot2_status") ?? "confirmed");
  if (!child_name || !child_last_name || !/^\d{4}-\d{2}-\d{2}$/.test(birth_date) ||
      !workshops.includes(slot1) || !workshops.includes(slot2) ||
      !["confirmed", "waitlist"].includes(status1) ||
      !["confirmed", "waitlist"].includes(status2)) {
    throw new Error("Bitte alle Angaben und Workshopstatus kontrollieren.");
  }
  const { error: workshopError } = await supabase.rpc("admin_update_workshops", {
    p_id: Number(id),
    p_workshop_slot1: slot1,
    p_workshop_slot1_status: status1,
    p_workshop_slot2: slot2,
    p_workshop_slot2_status: status2,
  });
  if (workshopError) throw new Error(workshopError.message);
  const { error } = await supabase.from("registrations").update({
    child_name, child_last_name, birth_date, companion,
  }).eq("id", id);
  if (error) throw new Error(error.message);

  redirect("/admin");
}

async function updateContactGroup(formData: FormData) {
  "use server";

  const rawIds = String(formData.get("registration_ids") ?? "");
  let ids: Array<string | number>;
  try {
    const parsed: unknown = JSON.parse(rawIds);
    if (!Array.isArray(parsed) || parsed.length === 0 ||
        parsed.some((id) => typeof id !== "string" && typeof id !== "number")) {
      throw new Error("Ungültige Anmeldungsliste.");
    }
    ids = parsed as Array<string | number>;
  } catch {
    throw new Error("Die zugehörigen Anmeldungen konnten nicht erkannt werden.");
  }

  const parent_name = String(formData.get("parent_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!parent_name || !email || !phone) {
    throw new Error("Bitte Name, E-Mail und Telefon der Kontaktperson ausfüllen.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("registrations")
    .update({ parent_name, email, phone })
    .in("id", ids);
  if (error) throw new Error(error.message);
  redirect("/admin");
}

async function deleteOneChild(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Kind-ID fehlt.");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("registrations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  redirect("/admin");
}

async function deleteFamily(formData: FormData) {
  "use server";
  if (formData.get("confirm_family_delete") !== "yes") {
    throw new Error("Bitte das Löschen der ganzen Familie bestätigen.");
  }
  const ids = parseRegistrationIds(formData);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("registrations").delete().in("id", ids);
  if (error) throw new Error(error.message);
  redirect("/admin");
}

function parseRegistrationIds(formData: FormData): Array<string | number> {
  try {
    const ids: unknown = JSON.parse(String(formData.get("registration_ids") ?? ""));
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) =>
      (typeof id !== "number" && typeof id !== "string") || String(id).trim() === ""
    )) throw new Error("IDs fehlen");
    return ids as Array<string | number>;
  } catch {
    throw new Error("Die Familienzuordnung konnte nicht gelesen werden.");
  }
}

async function addChildToFamily(formData: FormData) {
  "use server";
  const ids = parseRegistrationIds(formData);
  const firstName = String(formData.get("child_name") ?? "").trim();
  const lastName = String(formData.get("child_last_name") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "");
  let companion = String(formData.get("companion") ?? "").trim();
  let slot1 = String(formData.get("workshop_slot1") ?? "");
  let slot2 = String(formData.get("workshop_slot2") ?? "");
  if (!firstName || !lastName || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      !workshops.includes(slot1) || !workshops.includes(slot2)) {
    throw new Error("Bitte alle Angaben und beide Workshops ausfüllen.");
  }
  const today = new Date();
  const born = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(born.getTime()) || born > today) throw new Error("Ungültiges Geburtsdatum.");
  let age = today.getFullYear() - born.getFullYear();
  if (today.getMonth() < born.getMonth() ||
      (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) age--;

  const supabase = getSupabaseAdmin();
  const { data: family, error: familyError } = await supabase
    .from("registrations")
    .select("id,parent_name,email,phone,birth_date,companion,workshop_slot1,workshop_slot2")
    .in("id", ids);
  if (familyError) throw new Error(familyError.message);
  if (!family || family.length !== ids.length) throw new Error("Familie nicht vollständig gefunden. Bitte Seite neu laden.");
  const contact = family[0];
  if (age < 8) {
    const otherU8 = family.find((member) => {
      if (!member.birth_date) return false;
      const date = new Date(`${member.birth_date}T12:00:00`);
      let years = today.getFullYear() - date.getFullYear();
      if (today.getMonth() < date.getMonth() ||
          (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) years--;
      return years < 8;
    });
    if (otherU8) {
      companion = otherU8.companion ?? "";
      slot1 = otherU8.workshop_slot1 ?? "";
      slot2 = otherU8.workshop_slot2 ?? "";
    }
    if (!companion.trim()) throw new Error("Kinder unter 8 brauchen eine Begleitperson.");
  } else {
    companion = "";
  }

  const { error } = await supabase.rpc("book_workshop_family", {
    p_parent_name: contact.parent_name,
    p_email: contact.email,
    p_phone: contact.phone ?? "",
    p_children: [{
      firstName, lastName, birthDate,
      companion, slot1, slot2,
    }],
  });
  if (error) throw new Error(error.message);
  redirect("/admin");
}

export default async function AdminPage() {
  const supabase = getSupabaseAdmin();

  const registrationsResult =
    await supabase
      .from("registrations")
      .select("*");

  const capacityResult =
    await supabase
      .from("workshop_capacity")
      .select("*");

  if (registrationsResult.error) {
    return (
      <main style={pageStyle}>
        <h1>Admin – Bastelnachmittag</h1>

        <div style={errorStyle}>
          Fehler beim Laden der Anmeldungen:{" "}
          {registrationsResult.error.message}
        </div>
      </main>
    );
  }

  if (capacityResult.error) {
    return (
      <main style={pageStyle}>
        <h1>Admin – Bastelnachmittag</h1>

        <div style={errorStyle}>
          Fehler beim Laden der Workshopplätze:{" "}
          {capacityResult.error.message}
        </div>
      </main>
    );
  }

  const registrations =
    (registrationsResult.data ??
      []) as Registration[];

  const capacities: Capacity[] = [];

  for (
    const row of
    capacityResult.data ?? []
  ) {
    const workshop =
      row.workshop_name ??
      row.workshop ??
      row.name;

    const rawSlot =
      row.time_slot ??
      row.slot ??
      row.zeitfenster;

    const rawMax =
      row.max_places ??
      row.max_capacity ??
      row.capacity ??
      row.places;

    const slot =
      normalizeSlot(rawSlot);

    const maxPlaces =
      Number(rawMax);

    if (
      typeof workshop === "string" &&
      slot !== null &&
      Number.isFinite(maxPlaces)
    ) {
      capacities.push({
        workshop: workshop.trim(),
        slot,
        maxPlaces,
      });
    }
  }

  // Gruppierung nach Kontaktperson. Jede Registrierung bleibt ein eigener Datensatz.
  const groupsMap = new Map<string, Registration[]>();
  for (const registration of registrations) {
    const emailKey = registration.email?.trim().toLowerCase();
    const key = emailKey
      ? `email:${emailKey}`
      : `kontakt:${(registration.parent_name ?? "").trim().toLowerCase()}|${(registration.phone ?? "").trim()}`;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(registration);
  }
  const contactGroups = Array.from(groupsMap.entries()).map(([key, children]) => ({
    key,
    contact: children[0],
    children,
  }));
  const uniqueContacts = contactGroups.length;

  const accompaniedChildren =
    registrations.filter(
      (registration) =>
        Boolean(
          registration.companion?.trim()
        )
    ).length;

  const waitlistEntries =
    registrations.reduce(
      (total, registration) => {
        let count = total;

        if (
          registration.workshop_slot1_status ===
          "waitlist"
        ) {
          count++;
        }

        if (
          registration.workshop_slot2_status ===
          "waitlist"
        ) {
          count++;
        }

        return count;
      },
      0
    );

  // Nur bestaetigte Buchungen belegen einen Workshopplatz.
  const occupancy =
    capacities
      .map((capacity) => {
        const wanted =
          normalizeWorkshop(
            capacity.workshop
          );

        const booked =
          registrations.filter(
            (registration) => {
              const selected =
                capacity.slot === 1
                  ? registration.workshop_slot1
                  : registration.workshop_slot2;

              return (
                normalizeWorkshop(selected) === wanted &&
                (capacity.slot === 1
                  ? registration.workshop_slot1_status
                  : registration.workshop_slot2_status) !== "waitlist"
              );
            }
          ).length;

        return {
          ...capacity,
          booked,
          free: Math.max(
            0,
            capacity.maxPlaces -
              booked
          ),
        };
      })
      .sort((a, b) => {
        if (a.slot !== b.slot) {
          return a.slot - b.slot;
        }

        return a.workshop.localeCompare(
          b.workshop,
          "de"
        );
      });

  return (
    <main style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: "clamp(28px, 4vw, 42px)",
              letterSpacing: "-1px",
              color: "#173c36",
            }}
          >
            Adventsbasteln
          </h1>

          <p style={subtitleStyle}>
            Adminbereich · Anmeldungen und Workshopplätze verwalten
          </p>
        </div>

        <div style={headerButtonsStyle}>
          <a
            href="/admin/export"
            style={excelButtonStyle}
          >
            📊 Excel herunterladen
          </a>

          <a
            href="/admin"
            style={refreshButtonStyle}
          >
            ↻ Aktualisieren
          </a>
        </div>
      </div>

      <section style={summaryGridStyle}>
        <div style={summaryCardStyle}>
          <div style={summaryNumberStyle}>
            {registrations.length}
          </div>
          <div>Kinder angemeldet</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryNumberStyle}>
            {uniqueContacts}
          </div>
          <div>Kontaktpersonen</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryNumberStyle}>
            {accompaniedChildren}
          </div>
          <div>Kinder mit Begleitperson</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryNumberStyle}>
            {waitlistEntries}
          </div>
          <div>Wartelisten-Einträge</div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Workshopbelegung</h2>

        <p style={hintStyle}>
          Angezeigt werden ausschliesslich bestätigte Plätze.
          Kinder auf der Warteliste belegen keinen Platz.
        </p>

        <div style={workshopGridStyle}>
          {occupancy.map((item) => (
            <div
              key={`${item.workshop}-${item.slot}`}
              style={workshopCardStyle}
            >
              <strong>
                {item.workshop}
              </strong>

              <div
                style={{
                  marginTop: "6px",
                  color: "#555",
                }}
              >
                Zeitfenster {item.slot}
              </div>

              <div style={occupancyLineStyle}>
                <span>
                  {item.booked} / {item.maxPlaces}
                </span>

                <strong>
                  {item.booked >=
                  item.maxPlaces
                    ? "Voll / Warteliste"
                    : `${item.free} frei`}
                </strong>
              </div>

              <div style={barBackgroundStyle}>
                <div
                  style={{
                    ...barStyle,
                    width: `${
                      item.maxPlaces > 0
                        ? Math.min(
                            100,
                            (item.booked /
                              item.maxPlaces) *
                              100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>
          Anmeldungen bearbeiten
        </h2>

        {registrations.length === 0 ? (
          <p>
            Noch keine Anmeldungen.
          </p>
        ) : (
          contactGroups.map((group) => (
            <section key={group.key} style={contactCardStyle}>
              <div style={contactHeaderStyle}>
                <div>
                  <h3 style={{ margin: "0 0 7px", fontSize: "21px", color: "#204e3c" }}>
                    {group.contact.parent_name || "Kontaktperson ohne Namen"}
                  </h3>
                  <div style={{ color: "#57685f", fontSize: "14px", lineHeight: 1.7 }}>
                    <div>✉ {group.contact.email || "Keine E-Mail-Adresse"}</div>
                    <div>☎ {group.contact.phone || "Keine Telefonnummer"}</div>
                  </div>
                </div>
                <strong style={childrenCountStyle}>
                  {group.children.length} {group.children.length === 1 ? "Kind" : "Kinder"}
                </strong>
              </div>
              <details style={{ padding: "0 17px 17px" }}>
                <summary style={detailsSummaryStyle}>Kontaktperson bearbeiten</summary>
                <form action={updateContactGroup} style={{ marginTop: "15px" }}>
                  <input
                    type="hidden"
                    name="registration_ids"
                    value={JSON.stringify(group.children.map((child) => child.id))}
                  />
                  <div style={formGridStyle}>
                    <label>
                      Vorname und Name
                      <input name="parent_name" defaultValue={group.contact.parent_name ?? ""} style={inputStyle} required />
                    </label>
                    <label>
                      E-Mail-Adresse
                      <input name="email" type="email" defaultValue={group.contact.email ?? ""} style={inputStyle} required />
                    </label>
                    <label>
                      Telefonnummer
                      <input name="phone" type="tel" defaultValue={group.contact.phone ?? ""} style={inputStyle} required />
                    </label>
                  </div>
                  <p style={hintStyle}>Diese Änderungen gelten für alle {group.children.length} Kinder dieser Kontaktperson.</p>
                  <button type="submit" style={saveButtonStyle}>Kontaktperson speichern</button>
                </form>
              </details>
              <details style={{ padding: "0 17px 17px" }}>
                <summary style={detailsSummaryStyle}>+ Kind zu dieser Familie hinzufügen</summary>
                <form action={addChildToFamily} style={{ marginTop: 15 }}>
                  <input type="hidden" name="registration_ids" value={JSON.stringify(group.children.map((child) => child.id))} />
                  <div style={formGridStyle}>
                    <label>Vorname des Kindes<input name="child_name" required style={inputStyle} /></label>
                    <label>Nachname des Kindes<input name="child_last_name" required style={inputStyle} /></label>
                    <label>Geburtsdatum<input name="birth_date" type="date" required style={inputStyle} /></label>
                    <label>Begleitperson (bei unter 8 Jahren)<input name="companion" style={inputStyle} placeholder="Vorname und Name" /></label>
                    <label>Zeitfenster 1
                      <select name="workshop_slot1" required style={inputStyle} defaultValue="">
                        <option value="" disabled>Workshop auswählen</option>
                        {workshops.map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </label>
                    <label>Zeitfenster 2
                      <select name="workshop_slot2" required style={inputStyle} defaultValue="">
                        <option value="" disabled>Workshop auswählen</option>
                        {workshops.map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </label>
                  </div>
                  <p style={hintStyle}>Bei weiteren Kindern unter 8 Jahren übernimmt die App automatisch Begleitperson und Workshops der anderen unter 8-Jährigen. Ausgebuchte Workshops führen zur Warteliste.</p>
                  <button type="submit" style={saveButtonStyle}>Kind hinzufügen</button>
                </form>
              </details>
              <details style={{ padding: "0 17px 17px" }}>
                <summary style={{ ...detailsSummaryStyle, color: "#a12828" }}>Ganze Familie löschen</summary>
                <form action={deleteFamily} style={{ marginTop: 12 }}>
                  <input type="hidden" name="registration_ids" value={JSON.stringify(group.children.map((child) => child.id))} />
                  <p style={{ color: "#a12828", fontWeight: 600 }}>Achtung: Alle {group.children.length} Kinder und die Kontaktperson werden aus der Anmeldeliste entfernt. Dies kann nicht rückgängig gemacht werden.</p>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" name="confirm_family_delete" value="yes" required style={{ width: "auto" }} />
                    Ja, ich möchte die gesamte Familie löschen.
                  </label>
                  <button type="submit" style={{ ...deleteButtonStyle, marginTop: 12 }}>Ganze Familie endgültig löschen</button>
                </form>
              </details>
              <div style={{ padding: "0 17px 17px" }}>
                {group.children.map((registration) => (
                  <div key={String(registration.id)} style={childOverviewStyle}>
                    <strong>{registration.child_name} {registration.child_last_name}</strong>
                    <span style={{ color: "#66756b", fontSize: "13px" }}>
                      {registration.workshop_slot1 || "–"} / {registration.workshop_slot2 || "–"}
                    </span>
                  </div>
                ))}
              </div>
              <details style={{ padding: "0 17px 20px" }}>
                <summary style={detailsSummaryStyle}>Kinder bearbeiten und Anmeldungen verwalten</summary>
                {group.children.map((registration, index) => (
              <div
                key={
                  registration.id ??
                  index
                }
                style={
                  registrationCardStyle
                }
              >
                <form
                  action={
                    updateRegistration
                  }
                >
                  <input
                    type="hidden"
                    name="id"
                    value={
                      registration.id
                    }
                  />

                  <div style={registrationHeaderStyle}>
                    <div>
                      <h3
                        style={{
                          margin: 0,
                        }}
                      >
                        {registration.child_name}{" "}
                        {registration.child_last_name}
                      </h3>

                      {registration.created_at && (
                        <div style={smallTextStyle}>
                          Eingang:{" "}
                          {formatDate(
                            registration.created_at
                          )}
                        </div>
                      )}
                    </div>

                    <div style={statusGroupStyle}>
                      <span
                        style={
                          registration.workshop_slot1_status ===
                          "waitlist"
                            ? waitlistBadgeStyle
                            : confirmedBadgeStyle
                        }
                      >
                        ZF 1:{" "}
                        {statusLabel(
                          registration.workshop_slot1_status
                        )}
                      </span>

                      <span
                        style={
                          registration.workshop_slot2_status ===
                          "waitlist"
                            ? waitlistBadgeStyle
                            : confirmedBadgeStyle
                        }
                      >
                        ZF 2:{" "}
                        {statusLabel(
                          registration.workshop_slot2_status
                        )}
                      </span>
                    </div>
                  </div>

                  <div style={formGridStyle}>
                    <label>
                      Vorname Kind
                      <input
                        name="child_name"
                        defaultValue={
                          registration.child_name ??
                          ""
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label>
                      Nachname Kind
                      <input
                        name="child_last_name"
                        defaultValue={
                          registration.child_last_name ??
                          ""
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label>
                      Geburtstag
                      <input
                        type="date"
                        name="birth_date"
                        defaultValue={
                          registration.birth_date ??
                          ""
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label>
                      Begleitperson
                      <input
                        name="companion"
                        defaultValue={
                          registration.companion ??
                          ""
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label>
                      Zeitfenster 1
                      <select
                        name="workshop_slot1"
                        defaultValue={
                          registration.workshop_slot1 ??
                          ""
                        }
                        style={inputStyle}
                      >
                        {workshops.map(
                          (workshop) => (
                            <option
                              key={workshop}
                              value={workshop}
                            >
                              {workshop}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label>
                      Status Zeitfenster 1
                      <select
                        name="workshop_slot1_status"
                        defaultValue={
                          registration.workshop_slot1_status ??
                          "confirmed"
                        }
                        style={inputStyle}
                      >
                        <option value="confirmed">
                          Bestätigt
                        </option>
                        <option value="waitlist">
                          Warteliste
                        </option>
                      </select>
                    </label>

                    <label>
                      Zeitfenster 2
                      <select
                        name="workshop_slot2"
                        defaultValue={
                          registration.workshop_slot2 ??
                          ""
                        }
                        style={inputStyle}
                      >
                        {workshops.map(
                          (workshop) => (
                            <option
                              key={workshop}
                              value={workshop}
                            >
                              {workshop}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label>
                      Status Zeitfenster 2
                      <select
                        name="workshop_slot2_status"
                        defaultValue={
                          registration.workshop_slot2_status ??
                          "confirmed"
                        }
                        style={inputStyle}
                      >
                        <option value="confirmed">
                          Bestätigt
                        </option>
                        <option value="waitlist">
                          Warteliste
                        </option>
                      </select>
                    </label>

                  </div>

                  <button
                    type="submit"
                    style={saveButtonStyle}
                  >
                    Änderungen speichern
                  </button>
                </form>

                <form
                  action={deleteOneChild}
                  style={{
                    marginTop: "12px",
                  }}
                >
                  <input
                    type="hidden"
                    name="id"
                    value={
                      registration.id
                    }
                  />

                  <button
                    type="submit"
                    style={deleteButtonStyle}
                  >
                    Nur dieses Kind löschen
                  </button>
                </form>
              </div>
            ))}
              </details>
            </section>
          )))}
      </section>
    </main>
  );
}

const pageStyle = {
  maxWidth: "1280px",
  margin: "0 auto",
  padding: "clamp(18px, 4vw, 46px) 18px 80px",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#243e38",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "22px",
  flexWrap: "wrap" as const,
  padding: "clamp(22px, 4vw, 38px)",
  borderRadius: "22px",
  background: "linear-gradient(120deg, #e8f4ed 0%, #f9f4e8 100%)",
  border: "1px solid #dae7dc",
};

const headerButtonsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap" as const,
};

const subtitleStyle = {
  margin: 0,
  color: "#526a60",
  fontSize: "15px",
  lineHeight: 1.5,
};

const hintStyle = {
  color: "#68756d",
  marginTop: "-4px",
  marginBottom: "22px",
  lineHeight: 1.6,
  fontSize: "14px",
};

const refreshButtonStyle = {
  display: "inline-block",
  background: "#ffffff",
  border: "1px solid #b9cec0",
  color: "#245e4b",
  textDecoration: "none",
  padding: "12px 17px",
  borderRadius: "11px",
  fontWeight: 700,
  fontSize: "14px",
};

const excelButtonStyle = {
  display: "inline-block",
  background: "#236c51",
  color: "white",
  textDecoration: "none",
  padding: "12px 17px",
  borderRadius: "11px",
  fontWeight: 700,
  fontSize: "14px",
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginTop: "22px",
};

const summaryCardStyle = {
  border: "1px solid #e4eae4",
  borderRadius: "17px",
  padding: "23px 20px",
  background: "#ffffff",
  boxShadow: "0 5px 18px rgba(33, 65, 48, 0.055)",
  color: "#53635a",
  fontSize: "14px",
};

const summaryNumberStyle = {
  fontSize: "38px",
  fontWeight: 800,
  color: "#1e654d",
  marginBottom: "8px",
  lineHeight: 1.1,
};

const sectionStyle = {
  marginTop: "43px",
};

const sectionHeadingStyle = {
  fontSize: "clamp(21px, 2.6vw, 28px)",
  letterSpacing: "-0.5px",
  color: "#1b4437",
  margin: "0 0 17px",
};

const workshopGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "15px",
};

const workshopCardStyle = {
  border: "1px solid #e0e8e2",
  borderRadius: "17px",
  padding: "21px",
  background: "#ffffff",
  boxShadow: "0 5px 18px rgba(33, 65, 48, 0.05)",
  lineHeight: 1.45,
};

const occupancyLineStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: "8px",
  marginTop: "17px",
  fontSize: "14px",
};

const barBackgroundStyle = {
  width: "100%",
  height: "9px",
  background: "#e7ece7",
  borderRadius: "999px",
  marginTop: "12px",
  overflow: "hidden",
};

const barStyle = {
  height: "100%",
  background: "#38966e",
  borderRadius: "999px",
};

const registrationCardStyle = {
  border: "1px solid #dfe8e1",
  borderRadius: "19px",
  padding: "clamp(17px, 3vw, 28px)",
  marginBottom: "20px",
  background: "#ffffff",
  boxShadow: "0 6px 24px rgba(29, 60, 42, 0.055)",
};

const registrationHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "15px",
  flexWrap: "wrap" as const,
  marginBottom: "22px",
  paddingBottom: "17px",
  borderBottom: "1px solid #e8eee9",
  color: "#1f4b3c",
};

const statusGroupStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap" as const,
};

const confirmedBadgeStyle = {
  display: "inline-block",
  padding: "7px 11px",
  borderRadius: "999px",
  background: "#e0f4e7",
  color: "#17613e",
  fontSize: "12px",
  fontWeight: 700,
};

const waitlistBadgeStyle = {
  display: "inline-block",
  padding: "7px 11px",
  borderRadius: "999px",
  background: "#fff0cf",
  color: "#995913",
  fontSize: "12px",
  fontWeight: 700,
};

const smallTextStyle = {
  color: "#76847a",
  fontSize: "13px",
  marginTop: "7px",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
  gap: "18px 20px",
  color: "#52645a",
  fontSize: "13px",
  fontWeight: 700,
};

const inputStyle = {
  width: "100%",
  display: "block",
  padding: "12px 12px",
  marginTop: "8px",
  boxSizing: "border-box" as const,
  border: "1px solid #cddbd0",
  borderRadius: "10px",
  background: "#fcfdfb",
  color: "#263d31",
  fontSize: "15px",
  fontWeight: 400,
  minHeight: "45px",
};

const saveButtonStyle = {
  background: "#236c51",
  color: "white",
  border: "none",
  padding: "13px 19px",
  borderRadius: "11px",
  cursor: "pointer",
  marginTop: "22px",
  fontWeight: 700,
  fontSize: "14px",
};

const deleteButtonStyle = {
  background: "#fff6f5",
  color: "#a23131",
  border: "1px solid #eabbbb",
  padding: "11px 16px",
  borderRadius: "11px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "14px",
};

const errorStyle = {
  marginTop: "20px",
  padding: "17px",
  background: "#fff0ee",
  color: "#9b2727",
  border: "1px solid #f3c8c3",
  borderRadius: "11px",
};

const contactCardStyle = {
  background: "#fff",
  border: "1px solid #dfe8e1",
  borderRadius: "18px",
  marginBottom: "20px",
  overflow: "hidden",
  boxShadow: "0 6px 24px rgba(29, 60, 42, 0.055)",
};
const contactHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap" as const,
  gap: "12px",
  padding: "22px 24px",
  background: "#f4faf5",
  borderBottom: "1px solid #e0eee3",
};
const childrenCountStyle = {
  color: "#286447",
  background: "#e0f0e3",
  padding: "9px 13px",
  borderRadius: "30px",
  fontSize: "14px",
};
const childOverviewStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "space-between",
  gap: "7px 16px",
  alignItems: "center",
  padding: "12px 7px",
  borderBottom: "1px solid #eef1ec",
};
const detailsSummaryStyle = {
  cursor: "pointer",
  color: "#236c51",
  fontWeight: 700,
  padding: "14px 4px",
};
