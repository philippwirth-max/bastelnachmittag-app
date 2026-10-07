"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const workshops = [
  "Christbaumkugeln",
  "Salben herstellen",
  "Karten gestalten",
  "Badekugeln",
];

type Child = {
  firstName: string;
  lastName: string;
  birthDate: string;
  companion: string;
  slot1: string;
  slot2: string;
};

type Capacity = {
  workshop: string;
  slot: 1 | 2;
  maxPlaces: number;
};

type RegistrationRow = {
  workshop_slot1: string | null;
  workshop_slot2: string | null;
  workshop_slot1_status: string | null;
  workshop_slot2_status: string | null;
};

type SlotStatus = "confirmed" | "waitlist";

export default function Page() {
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [capacities, setCapacities] =
    useState<Capacity[]>([]);

  const [registrations, setRegistrations] =
    useState<RegistrationRow[]>([]);

  const [loadingCapacity, setLoadingCapacity] =
    useState(true);

  const [children, setChildren] = useState<Child[]>([
    {
      firstName: "",
      lastName: "",
      birthDate: "",
      companion: "",
      slot1: "",
      slot2: "",
    },
  ]);

  useEffect(() => {
    loadAvailability();
  }, []);

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

  async function loadAvailability() {
    setLoadingCapacity(true);

    try {
      const {
        data: capacityData,
        error: capacityError,
      } = await supabase
        .from("workshop_capacity")
        .select("*");

      if (capacityError) {
        throw capacityError;
      }

      const parsedCapacities: Capacity[] = [];

      for (const row of capacityData ?? []) {
        const workshop =
          row.workshop_name ??
          row.workshop ??
          row.name;

        const rawSlot =
          row.time_slot ??
          row.slot ??
          row.zeitfenster;

        const rawMaxPlaces =
          row.max_places ??
          row.max_capacity ??
          row.capacity ??
          row.places;

        const slot =
          normalizeSlot(rawSlot);

        const maxPlaces =
          Number(rawMaxPlaces);

        if (
          typeof workshop === "string" &&
          slot !== null &&
          Number.isFinite(maxPlaces)
        ) {
          parsedCapacities.push({
            workshop: workshop.trim(),
            slot,
            maxPlaces,
          });
        }
      }

      setCapacities(parsedCapacities);

      const {
        data: registrationData,
        error: registrationError,
      } = await supabase
        .from("registrations")
        .select(
          `
          workshop_slot1,
          workshop_slot2,
          workshop_slot1_status,
          workshop_slot2_status
          `
        );

      if (registrationError) {
        throw registrationError;
      }

      setRegistrations(
        registrationData ?? []
      );
    } catch (error: unknown) {
      console.error(error);

      if (error instanceof Error) {
        setMessage(
          `❌ Fehler beim Laden der Workshopplätze: ${error.message}`
        );
      } else {
        setMessage(
          "❌ Die Workshopplätze konnten nicht geladen werden."
        );
      }
    } finally {
      setLoadingCapacity(false);
    }
  }

  function calculateAge(
    dateString: string
  ): number | null {
    if (!dateString) {
      return null;
    }

    const birth =
      new Date(dateString);

    const today =
      new Date();

    let age =
      today.getFullYear() -
      birth.getFullYear();

    const monthDiff =
      today.getMonth() -
      birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 &&
        today.getDate() <
          birth.getDate())
    ) {
      age--;
    }

    return age;
  }

  function addChild() {
    setChildren(
      (currentChildren) => [
        ...currentChildren,
        {
          firstName: "",
          lastName: "",
          birthDate: "",
          companion: "",
          slot1: "",
          slot2: "",
        },
      ]
    );
  }

  function removeChild(index: number) {
    setChildren((currentChildren) => {
      if (currentChildren.length <= 1) {
        return currentChildren;
      }

      return currentChildren.filter(
        (_, childIndex) =>
          childIndex !== index
      );
    });
  }

  function updateChild(
    index: number,
    field: keyof Child,
    value: string
  ) {
    setChildren((currentChildren) => {
      let updatedChildren =
        currentChildren.map(
          (child, childIndex) =>
            childIndex === index
              ? {
                  ...child,
                  [field]: value,
                }
              : child
        );

      /*
        Wenn das Geburtsdatum geändert wird
        und das Kind nun unter 8 ist,
        übernimmt es automatisch die
        Workshopwahl des ersten anderen
        Kindes unter 8.
      */
      if (field === "birthDate") {
        const changedChild =
          updatedChildren[index];

        const changedAge =
          calculateAge(
            changedChild.birthDate
          );

        if (
          changedAge !== null &&
          changedAge < 8
        ) {
          const firstOtherUnder8 =
            updatedChildren.find(
              (child, childIndex) => {
                if (
                  childIndex === index
                ) {
                  return false;
                }

                const age =
                  calculateAge(
                    child.birthDate
                  );

                return (
                  age !== null &&
                  age < 8
                );
              }
            );

          if (firstOtherUnder8) {
            updatedChildren =
              updatedChildren.map(
                (child, childIndex) =>
                  childIndex === index
                    ? {
                        ...child,
                        slot1:
                          firstOtherUnder8.slot1,
                        slot2:
                          firstOtherUnder8.slot2,
                      }
                    : child
              );
          }
        }
      }

      /*
        Wenn bei einem Kind unter 8
        ein Workshop gewählt wird,
        erhalten alle Kinder unter 8
        denselben Workshop.
      */
      if (
        field === "slot1" ||
        field === "slot2"
      ) {
        const changedChild =
          updatedChildren[index];

        const age =
          calculateAge(
            changedChild.birthDate
          );

        if (
          age !== null &&
          age < 8
        ) {
          updatedChildren =
            updatedChildren.map(
              (child) => {
                const childAge =
                  calculateAge(
                    child.birthDate
                  );

                if (
                  childAge !== null &&
                  childAge < 8
                ) {
                  return {
                    ...child,
                    [field]: value,
                  };
                }

                return child;
              }
            );
        }
      }

      return updatedChildren;
    });
  }

  function getFirstUnder8Index() {
    return children.findIndex(
      (child) => {
        const age =
          calculateAge(
            child.birthDate
          );

        return (
          age !== null &&
          age < 8
        );
      }
    );
  }

  function getMaxPlaces(
    workshop: string,
    slot: 1 | 2
  ): number {
    const capacity =
      capacities.find(
        (item) =>
          item.workshop === workshop &&
          item.slot === slot
      );

    return capacity?.maxPlaces ?? 0;
  }

  function workshopExistsInCapacity(
    workshop: string,
    slot: 1 | 2
  ) {
    return capacities.some(
      (capacity) =>
        capacity.workshop === workshop &&
        capacity.slot === slot
    );
  }

  function getBookedPlacesFromRows(
    rows: RegistrationRow[],
    workshop: string,
    slot: 1 | 2
  ): number {
    if (slot === 1) {
      return rows.filter(
        (registration) =>
          registration.workshop_slot1 ===
            workshop &&
          (
            registration.workshop_slot1_status ??
            "confirmed"
          ) === "confirmed"
      ).length;
    }

    return rows.filter(
      (registration) =>
        registration.workshop_slot2 ===
          workshop &&
        (
          registration.workshop_slot2_status ??
          "confirmed"
        ) === "confirmed"
    ).length;
  }

  function getBookedPlaces(
    workshop: string,
    slot: 1 | 2
  ): number {
    return getBookedPlacesFromRows(
      registrations,
      workshop,
      slot
    );
  }

  function getCurrentFormPlaces(
    workshop: string,
    slot: 1 | 2,
    ignoreChildIndex?: number
  ): number {
    return children.filter(
      (child, index) => {
        if (
          index === ignoreChildIndex
        ) {
          return false;
        }

        if (slot === 1) {
          return (
            child.slot1 === workshop
          );
        }

        return (
          child.slot2 === workshop
        );
      }
    ).length;
  }

  function getRemainingPlaces(
    workshop: string,
    slot: 1 | 2,
    ignoreChildIndex?: number
  ): number {
    const maxPlaces =
      getMaxPlaces(
        workshop,
        slot
      );

    const bookedPlaces =
      getBookedPlaces(
        workshop,
        slot
      );

    const currentFormPlaces =
      getCurrentFormPlaces(
        workshop,
        slot,
        ignoreChildIndex
      );

    return Math.max(
      0,
      maxPlaces -
        bookedPlaces -
        currentFormPlaces
    );
  }

  function getWaitlistCount(
    workshop: string,
    slot: 1 | 2
  ): number {
    if (slot === 1) {
      return registrations.filter(
        (registration) =>
          registration.workshop_slot1 ===
            workshop &&
          registration.workshop_slot1_status ===
            "waitlist"
      ).length;
    }

    return registrations.filter(
      (registration) =>
        registration.workshop_slot2 ===
          workshop &&
        registration.workshop_slot2_status ===
          "waitlist"
    ).length;
  }

  function renderWorkshopOptions(
    slot: 1 | 2,
    childIndex: number
  ) {
    return workshops.map(
      (workshop) => {
        const configured =
          workshopExistsInCapacity(
            workshop,
            slot
          );

        const remaining =
          getRemainingPlaces(
            workshop,
            slot,
            childIndex
          );

        const waitlistCount =
          getWaitlistCount(
            workshop,
            slot
          );

        let label =
          workshop;

        if (loadingCapacity) {
          label +=
            " – Plätze werden geladen";
        } else if (!configured) {
          label +=
            " – nicht verfügbar";
        } else if (
          remaining <= 0
        ) {
          if (
            waitlistCount === 0
          ) {
            label +=
              " – ausgebucht / Warteliste";
          } else {
            label +=
              ` – Warteliste (${waitlistCount} bereits vorgemerkt)`;
          }
        } else if (
          remaining === 1
        ) {
          label +=
            " – noch 1 Platz";
        } else {
          label +=
            ` – noch ${remaining} Plätze`;
        }

        return (
          <option
            key={workshop}
            value={workshop}
            disabled={
              loadingCapacity ||
              !configured
            }
          >
            {label}
          </option>
        );
      }
    );
  }

  async function refreshRegistrations() {
    const {
      data,
      error,
    } = await supabase
      .from("registrations")
      .select(
        `
        workshop_slot1,
        workshop_slot2,
        workshop_slot1_status,
        workshop_slot2_status
        `
      );

    if (error) {
      throw error;
    }

    const rows =
      (data ??
        []) as RegistrationRow[];

    setRegistrations(rows);

    return rows;
  }

  function determineStatuses(
    currentRegistrations:
      RegistrationRow[]
  ) {
    const bookedCounts =
      new Map<string, number>();

    for (
      const workshop of workshops
    ) {
      bookedCounts.set(
        `${workshop}-1`,
        getBookedPlacesFromRows(
          currentRegistrations,
          workshop,
          1
        )
      );

      bookedCounts.set(
        `${workshop}-2`,
        getBookedPlacesFromRows(
          currentRegistrations,
          workshop,
          2
        )
      );
    }

    return children.map(
      (child) => {
        const slot1Key =
          `${child.slot1}-1`;

        const slot2Key =
          `${child.slot2}-2`;

        const slot1Booked =
          bookedCounts.get(
            slot1Key
          ) ?? 0;

        const slot2Booked =
          bookedCounts.get(
            slot2Key
          ) ?? 0;

        const slot1Max =
          getMaxPlaces(
            child.slot1,
            1
          );

        const slot2Max =
          getMaxPlaces(
            child.slot2,
            2
          );

        const slot1Status:
          SlotStatus =
          slot1Booked <
          slot1Max
            ? "confirmed"
            : "waitlist";

        const slot2Status:
          SlotStatus =
          slot2Booked <
          slot2Max
            ? "confirmed"
            : "waitlist";

        if (
          slot1Status ===
          "confirmed"
        ) {
          bookedCounts.set(
            slot1Key,
            slot1Booked + 1
          );
        }

        if (
          slot2Status ===
          "confirmed"
        ) {
          bookedCounts.set(
            slot2Key,
            slot2Booked + 1
          );
        }

        return {
          slot1Status,
          slot2Status,
        };
      }
    );
  }

  async function saveRegistration() {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      if (
        !contactName.trim()
      ) {
        setMessage(
          "❌ Bitte Name der Kontaktperson eingeben."
        );
        return;
      }

      if (!email.trim()) {
        setMessage(
          "❌ Bitte E-Mail-Adresse eingeben."
        );
        return;
      }

      if (!phone.trim()) {
        setMessage(
          "❌ Bitte Telefonnummer eingeben."
        );
        return;
      }

      for (
        const child of children
      ) {
        if (
          !child.firstName.trim()
        ) {
          setMessage(
            "❌ Bitte bei jedem Kind den Vornamen angeben."
          );
          return;
        }

        if (
          !child.lastName.trim()
        ) {
          setMessage(
            "❌ Bitte bei jedem Kind den Nachnamen angeben."
          );
          return;
        }

        if (!child.birthDate) {
          setMessage(
            "❌ Bitte bei jedem Kind das Geburtsdatum angeben."
          );
          return;
        }

        if (!child.slot1) {
          setMessage(
            `❌ Bitte für ${child.firstName} einen Workshop im Zeitfenster 1 wählen.`
          );
          return;
        }

        if (!child.slot2) {
          setMessage(
            `❌ Bitte für ${child.firstName} einen Workshop im Zeitfenster 2 wählen.`
          );
          return;
        }

        const age =
          calculateAge(
            child.birthDate
          );

        if (
          age !== null &&
          age < 8 &&
          !child.companion.trim()
        ) {
          setMessage(
            `❌ ${child.firstName} benötigt eine Begleitperson.`
          );
          return;
        }
      }

      /*
        Zusätzliche Sicherheitsprüfung:
        Alle Kinder unter 8 müssen
        dieselben Workshops haben.
      */

      const under8Children =
        children.filter(
          (child) => {
            const age =
              calculateAge(
                child.birthDate
              );

            return (
              age !== null &&
              age < 8
            );
          }
        );

      if (
        under8Children.length > 1
      ) {
        const first =
          under8Children[0];

        const differentWorkshop =
          under8Children.some(
            (child) =>
              child.slot1 !==
                first.slot1 ||
              child.slot2 !==
                first.slot2
          );

        if (differentWorkshop) {
          setMessage(
            "❌ Kinder unter 8 Jahren mit gemeinsamer Begleitung müssen dieselben Workshops besuchen."
          );
          return;
        }
      }

      const currentRegistrations =
        await refreshRegistrations();

      const statuses =
        determineStatuses(
          currentRegistrations
        );

      let hasWaitlist =
        false;

      const rowsToInsert =
        children.map(
          (child, index) => {
            const status =
              statuses[index];

            if (
              status.slot1Status ===
                "waitlist" ||
              status.slot2Status ===
                "waitlist"
            ) {
              hasWaitlist =
                true;
            }

            return {
              parent_name:
                contactName.trim(),

              email:
                email.trim(),

              phone:
                phone.trim(),

              child_name:
                child.firstName.trim(),

              child_last_name:
                child.lastName.trim(),

              birth_date:
                child.birthDate,

              companion:
                child.companion.trim(),

              workshop_slot1:
                child.slot1,

              workshop_slot1_status:
                status.slot1Status,

              workshop_slot2:
                child.slot2,

              workshop_slot2_status:
                status.slot2Status,
            };
          }
        );

      const {
        error,
      } = await supabase
        .from("registrations")
        .insert(rowsToInsert);

      if (error) {
        throw error;
      }

      if (hasWaitlist) {
        setMessage(
          "✅ Anmeldung gespeichert. Bei mindestens einem Workshop ist das Kind auf der Warteliste."
        );
      } else {
        setMessage(
          "✅ Anmeldung erfolgreich gespeichert. Alle gewählten Workshops sind bestätigt."
        );
      }

      setContactName("");
      setEmail("");
      setPhone("");

      setChildren([
        {
          firstName: "",
          lastName: "",
          birthDate: "",
          companion: "",
          slot1: "",
          slot2: "",
        },
      ]);

      await loadAvailability();
    } catch (error: unknown) {
      console.error(error);

      if (
        error instanceof Error
      ) {
        setMessage(
          `❌ Fehler: ${error.message}`
        );
      } else {
        setMessage(
          "❌ Unbekannter Fehler."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const firstUnder8Index =
    getFirstUnder8Index();

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "20px",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <h1>
        Bastelnachmittag Anmeldung
      </h1>

      <h2>
        Kontaktperson
      </h2>

      <input
        value={contactName}
        onChange={(e) =>
          setContactName(
            e.target.value
          )
        }
        placeholder="Name"
        style={inputStyle}
      />

      <input
        type="email"
        value={email}
        onChange={(e) =>
          setEmail(
            e.target.value
          )
        }
        placeholder="E-Mail"
        style={inputStyle}
      />

      <input
        type="tel"
        value={phone}
        onChange={(e) =>
          setPhone(
            e.target.value
          )
        }
        placeholder="Telefon"
        style={inputStyle}
      />

      <hr
        style={{
          margin: "30px 0",
        }}
      />

      <h2>
        Kinder
      </h2>

      {loadingCapacity && (
        <p>
          Workshopplätze werden
          geladen …
        </p>
      )}

      {children.map(
        (
          child,
          index
        ) => {
          const age =
            calculateAge(
              child.birthDate
            );

          const isUnder8 =
            age !== null &&
            age < 8;

          const workshopChoiceLocked =
            isUnder8 &&
            firstUnder8Index !== -1 &&
            index !==
              firstUnder8Index;

          return (
            <div
              key={index}
              style={{
                border:
                  "1px solid #ddd",
                padding:
                  "20px",
                borderRadius:
                  "10px",
                marginBottom:
                  "20px",
              }}
            >
              <div style={childHeaderStyle}>
                <h3
                  style={{
                    margin: 0,
                  }}
                >
                  Kind {index + 1}
                </h3>

                {children.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      removeChild(index)
                    }
                    style={removeButtonStyle}
                  >
                    Kind entfernen
                  </button>
                )}
              </div>

              <input
                value={
                  child.firstName
                }
                onChange={(e) =>
                  updateChild(
                    index,
                    "firstName",
                    e.target.value
                  )
                }
                placeholder="Vorname"
                style={
                  inputStyle
                }
              />

              <input
                value={
                  child.lastName
                }
                onChange={(e) =>
                  updateChild(
                    index,
                    "lastName",
                    e.target.value
                  )
                }
                placeholder="Nachname"
                style={
                  inputStyle
                }
              />

              <input
                type="date"
                value={
                  child.birthDate
                }
                onChange={(e) =>
                  updateChild(
                    index,
                    "birthDate",
                    e.target.value
                  )
                }
                style={
                  inputStyle
                }
              />

              {age !== null && (
                <p>
                  Alter:{" "}
                  <strong>
                    {age}
                  </strong>
                </p>
              )}

              {isUnder8 && (
                <>
                  <p>
                    Für Kinder unter
                    8 Jahren ist eine
                    Begleitperson
                    erforderlich.
                  </p>

                  <input
                    value={
                      child.companion
                    }
                    onChange={(e) =>
                      updateChild(
                        index,
                        "companion",
                        e.target.value
                      )
                    }
                    placeholder="Name der Begleitperson"
                    style={
                      inputStyle
                    }
                  />
                </>
              )}

              {workshopChoiceLocked && (
                <div
                  style={
                    infoBoxStyle
                  }
                >
                  Die Workshopwahl
                  wird automatisch
                  vom ersten Kind
                  unter 8 Jahren
                  übernommen.
                </div>
              )}

              <label>
                Zeitfenster 1
              </label>

              <select
                value={
                  child.slot1
                }
                onChange={(e) =>
                  updateChild(
                    index,
                    "slot1",
                    e.target.value
                  )
                }
                style={
                  inputStyle
                }
                disabled={
                  loadingCapacity ||
                  workshopChoiceLocked
                }
              >
                <option value="">
                  Workshop wählen
                </option>

                {renderWorkshopOptions(
                  1,
                  index
                )}
              </select>

              <label>
                Zeitfenster 2
              </label>

              <select
                value={
                  child.slot2
                }
                onChange={(e) =>
                  updateChild(
                    index,
                    "slot2",
                    e.target.value
                  )
                }
                style={
                  inputStyle
                }
                disabled={
                  loadingCapacity ||
                  workshopChoiceLocked
                }
              >
                <option value="">
                  Workshop wählen
                </option>

                {renderWorkshopOptions(
                  2,
                  index
                )}
              </select>
            </div>
          );
        }
      )}

      <button
        type="button"
        onClick={addChild}
        style={
          secondaryButton
        }
      >
        + Weiteres Kind
        hinzufügen
      </button>

      <div
        style={{
          marginTop: "30px",
        }}
      >
        <h2>
          Kinder unter 8 Jahren
        </h2>

        <p>
          Werden mehrere Kinder
          unter 8 Jahren gemeinsam
          angemeldet, besuchen sie
          dieselben Workshops.
          Die Workshopwahl wird
          automatisch für alle
          Kinder unter 8 übernommen.
        </p>
      </div>

      <div
        style={{
          marginTop: "30px",
        }}
      >
        <h2>
          Hinweis zur Warteliste
        </h2>

        <p>
          Ist ein Workshop bereits
          ausgebucht, kann er
          trotzdem gewählt werden.
          Das Kind wird dann für
          diesen Workshop auf die
          Warteliste gesetzt.
        </p>
      </div>

      <div
        style={{
          marginTop: "30px",
        }}
      >
        <h2>
          Fotohinweis
        </h2>

        <p>
          Während des
          Bastelnachmittags werden
          Fotos gemacht. Es werden
          keine Einzelfotos von
          Kindern veröffentlicht.
        </p>
      </div>

      <button
        type="button"
        onClick={
          saveRegistration
        }
        style={{
          ...primaryButton,
          opacity:
            saving ||
            loadingCapacity
              ? 0.6
              : 1,
        }}
        disabled={
          saving ||
          loadingCapacity
        }
      >
        {saving
          ? "Anmeldung wird gespeichert …"
          : "Anmeldung speichern"}
      </button>

      {message && (
        <p
          style={{
            marginTop:
              "20px",
            fontWeight:
              600,
          }}
        >
          {message}
        </p>
      )}
    </main>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px",
  marginTop: "6px",
  marginBottom: "14px",
  boxSizing:
    "border-box" as const,
};

const primaryButton = {
  background: "green",
  color: "white",
  border: "none",
  padding:
    "12px 20px",
  borderRadius: "6px",
  cursor: "pointer",
  marginTop: "20px",
};

const secondaryButton = {
  background: "#2563eb",
  color: "white",
  border: "none",
  padding:
    "10px 18px",
  borderRadius: "6px",
  cursor: "pointer",
};

const infoBoxStyle = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "6px",
  padding: "10px",
  marginBottom: "14px",
  color: "#1e3a8a",
};

const childHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  marginBottom: "15px",
};

const removeButtonStyle = {
  background: "#fff",
  color: "#b91c1c",
  border: "1px solid #b91c1c",
  padding: "7px 11px",
  borderRadius: "6px",
  cursor: "pointer",
};
