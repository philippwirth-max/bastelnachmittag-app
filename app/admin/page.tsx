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

  const { error } = await supabase
    .from("registrations")
    .update({
      parent_name: String(
        formData.get("parent_name") ?? ""
      ).trim(),

      email: String(
        formData.get("email") ?? ""
      ).trim(),

      phone: String(
        formData.get("phone") ?? ""
      ).trim(),

      child_name: String(
        formData.get("child_name") ?? ""
      ).trim(),

      child_last_name: String(
        formData.get("child_last_name") ?? ""
      ).trim(),

      birth_date: String(
        formData.get("birth_date") ?? ""
      ),

      companion: String(
        formData.get("companion") ?? ""
      ).trim(),

      workshop_slot1: String(
        formData.get("workshop_slot1") ?? ""
      ),

      workshop_slot1_status: String(
        formData.get("workshop_slot1_status") ??
          "confirmed"
      ),

      workshop_slot2: String(
        formData.get("workshop_slot2") ?? ""
      ),

      workshop_slot2_status: String(
        formData.get("workshop_slot2_status") ??
          "confirmed"
      ),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/admin");
}

async function deleteRegistration(
  formData: FormData
) {
  "use server";

  const supabase = getSupabaseAdmin();

  const id = formData.get("id");

  if (!id) {
    throw new Error("ID fehlt.");
  }

  const { error } = await supabase
    .from("registrations")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

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

  const uniqueContacts =
    new Set(
      registrations.map(
        (registration) =>
          registration.email
            ?.trim()
            .toLowerCase() ||
          `${registration.parent_name}-${registration.phone}`
      )
    ).size;

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

  /*
    Wie von dir gewünscht zählt die
    Workshopbelegung hier ALLE Anmeldungen,
    also auch Wartelisten-Einträge.
  */
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
                normalizeWorkshop(
                  selected
                ) === wanted
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
              marginBottom: "5px",
            }}
          >
            Bastelnachmittag
          </h1>

          <p style={subtitleStyle}>
            Administration und Anmeldungen
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
        <h2>Workshopbelegung</h2>

        <p style={hintStyle}>
          Die Zahl enthält auch Kinder auf der
          Warteliste. Sobald 8 erreicht sind,
          gilt der Workshop als ausgebucht.
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
                    ? "Ausgebucht"
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
        <h2>
          Anmeldungen bearbeiten
        </h2>

        {registrations.length === 0 ? (
          <p>
            Noch keine Anmeldungen.
          </p>
        ) : (
          registrations.map(
            (
              registration,
              index
            ) => (
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

                    <label>
                      Kontaktperson
                      <input
                        name="parent_name"
                        defaultValue={
                          registration.parent_name ??
                          ""
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label>
                      E-Mail
                      <input
                        type="email"
                        name="email"
                        defaultValue={
                          registration.email ??
                          ""
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label>
                      Telefon
                      <input
                        name="phone"
                        defaultValue={
                          registration.phone ??
                          ""
                        }
                        style={inputStyle}
                      />
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
                  action={
                    deleteRegistration
                  }
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
                    Anmeldung löschen
                  </button>
                </form>
              </div>
            )
          )
        )}
      </section>
    </main>
  );
}

const pageStyle = {
  maxWidth: "1400px",
  margin: "0 auto",
  padding: "30px 20px 60px",
  fontFamily:
    "Arial, Helvetica, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  flexWrap: "wrap" as const,
};

const headerButtonsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap" as const,
};

const subtitleStyle = {
  marginTop: 0,
  color: "#666",
};

const hintStyle = {
  color: "#666",
  marginTop: "-5px",
  marginBottom: "20px",
};

const refreshButtonStyle = {
  display: "inline-block",
  background: "#2563eb",
  color: "white",
  textDecoration: "none",
  padding: "10px 16px",
  borderRadius: "7px",
  fontWeight: 600,
};

const excelButtonStyle = {
  display: "inline-block",
  background: "#16803c",
  color: "white",
  textDecoration: "none",
  padding: "10px 16px",
  borderRadius: "7px",
  fontWeight: 600,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "15px",
  marginTop: "30px",
};

const summaryCardStyle = {
  border: "1px solid #ddd",
  borderRadius: "10px",
  padding: "20px",
  background: "#fff",
};

const summaryNumberStyle = {
  fontSize: "32px",
  fontWeight: 700,
  marginBottom: "5px",
};

const sectionStyle = {
  marginTop: "40px",
};

const workshopGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "15px",
};

const workshopCardStyle = {
  border: "1px solid #ddd",
  borderRadius: "10px",
  padding: "18px",
  background: "#fff",
};

const occupancyLineStyle = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: "14px",
};

const barBackgroundStyle = {
  width: "100%",
  height: "8px",
  background: "#e5e7eb",
  borderRadius: "999px",
  marginTop: "10px",
  overflow: "hidden",
};

const barStyle = {
  height: "100%",
  background: "#2563eb",
  borderRadius: "999px",
};

const registrationCardStyle = {
  border: "1px solid #ddd",
  borderRadius: "12px",
  padding: "20px",
  marginBottom: "20px",
  background: "#fff",
};

const registrationHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "15px",
  flexWrap: "wrap" as const,
  marginBottom: "20px",
};

const statusGroupStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap" as const,
};

const confirmedBadgeStyle = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "#dcfce7",
  color: "#166534",
  fontSize: "13px",
  fontWeight: 700,
};

const waitlistBadgeStyle = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "#fef3c7",
  color: "#92400e",
  fontSize: "13px",
  fontWeight: 700,
};

const smallTextStyle = {
  color: "#666",
  fontSize: "13px",
  marginTop: "5px",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "15px",
};

const inputStyle = {
  width: "100%",
  display: "block",
  padding: "10px",
  marginTop: "6px",
  boxSizing:
    "border-box" as const,
};

const saveButtonStyle = {
  background: "#16803c",
  color: "white",
  border: "none",
  padding: "11px 18px",
  borderRadius: "7px",
  cursor: "pointer",
  marginTop: "18px",
};

const deleteButtonStyle = {
  background: "#b91c1c",
  color: "white",
  border: "none",
  padding: "9px 15px",
  borderRadius: "7px",
  cursor: "pointer",
};

const errorStyle = {
  marginTop: "20px",
  padding: "15px",
  background: "#fee2e2",
  border: "1px solid #fecaca",
  borderRadius: "8px",
};
