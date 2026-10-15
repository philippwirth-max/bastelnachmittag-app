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

type AvailabilityEntry = {
  workshop: string;
  slot: 1 | 2;
  confirmed: number;
  waitlist: number;
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

  const [availability, setAvailability] =
    useState<AvailabilityEntry[]>([]);

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

      await refreshAvailability();
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
                        companion:
                          firstOtherUnder8.companion,
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
        Begleitperson oder Workshop
        geändert werden, erhalten alle
        Kinder unter 8 denselben Wert.
      */
      if (
        field === "companion" ||
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

  function getBookedPlaces(
    workshop: string,
    slot: 1 | 2
  ): number {
    return availability.find(
      (item) => item.workshop === workshop && item.slot === slot
    )?.confirmed ?? 0;
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
    return availability.find(
      (item) => item.workshop === workshop && item.slot === slot
    )?.waitlist ?? 0;
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

  async function refreshAvailability(): Promise<AvailabilityEntry[]> {
    const response = await fetch("/api/availability", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Workshopbelegung konnte nicht geladen werden.");
    }
    const result: { availability?: AvailabilityEntry[] } = await response.json();
    if (!Array.isArray(result.availability)) {
      throw new Error("Ungültige Antwort der Workshopbelegung.");
    }
    setAvailability(result.availability);
    return result.availability;
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

      // Die Platzvergabe erfolgt ausschliesslich auf dem Server.
      // Der Browser schreibt nicht mehr direkt in registrations.
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName: contactName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          children: children.map((child) => ({
            firstName: child.firstName.trim(),
            lastName: child.lastName.trim(),
            birthDate: child.birthDate,
            companion: child.companion.trim(),
            slot1: child.slot1,
            slot2: child.slot2,
          })),
        }),
      });

      const result: {
        error?: string;
        children?: { slot1Status: SlotStatus; slot2Status: SlotStatus }[];
      } = await response.json();

      if (!response.ok || !Array.isArray(result.children)) {
        throw new Error(result.error || "Anmeldung fehlgeschlagen.");
      }

      const hasWaitlist = result.children.some(
        (child) => child.slot1Status === "waitlist" || child.slot2Status === "waitlist"
      );

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

  const isSuccess = message.startsWith("✅");

  return (
    <main className="page">
      <div className="shell">
        <header className="hero">
          <div className="eyebrow">KREATIV SEIN · GEMEINSAM ZEIT VERBRINGEN</div>
          <div className="heroIcon" aria-hidden="true">✂️</div>
          <h1>Adventsbasteln</h1>
          <p className="heroText">Kleine Geschenke, grosse Freude! Melde deine Kinder für zwei kreative Workshoprunden an.</p>
          <div className="heroPills"><span>🎨 4 Workshops</span><span>👧 Für Kinder und Familien</span><span>✨ 2 Zeitfenster</span></div>
        </header>

        <section className="panel" aria-labelledby="contact-heading">
          <div className="sectionHeading"><span className="step">1</span><div><h2 id="contact-heading">Kontaktperson</h2><p>Damit wir dich bei Fragen erreichen können.</p></div></div>
          <div className="fields">
            <div className="field full"><label htmlFor="contactName">Vorname und Name <span className="required">*</span></label><input id="contactName" autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Vorname und Name" /></div>
            <div className="field"><label htmlFor="email">E-Mail-Adresse <span className="required">*</span></label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.ch" /></div>
            <div className="field"><label htmlFor="phone">Telefonnummer <span className="required">*</span></label><input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="079 123 45 67" /></div>
          </div>
        </section>

        <section className="panel" aria-labelledby="children-heading">
          <div className="sectionHeading"><span className="step">2</span><div><h2 id="children-heading">Kinder und Workshops</h2><p>Für jedes Kind zwei Workshops auswählen. Die Plätze werden direkt angezeigt.</p></div></div>
          {loadingCapacity && <div className="notice" role="status">⏳ Die freien Workshopplätze werden geladen …</div>}
          <div className="childList">
            {children.map((child, index) => {
              const age = calculateAge(child.birthDate);
              const isUnder8 = age !== null && age < 8;
              const sharedUnder8FieldsLocked = isUnder8 && firstUnder8Index !== -1 && index !== firstUnder8Index;
              const workshopChoiceLocked = sharedUnder8FieldsLocked;
              return (
                <div className="childCard" key={index}>
                  <div className="childHeader">
                    <div className="childTitle"><span className="childNumber">{index + 1}</span><h3>Kind {index + 1}</h3>{age !== null && <span className="ageBadge">{age} Jahre</span>}</div>
                    {children.length > 1 && <button className="removeButton" type="button" onClick={() => removeChild(index)}>Entfernen</button>}
                  </div>
                  <div className="fields">
                    <div className="field"><label htmlFor={`first-${index}`}>Vorname <span className="required">*</span></label><input id={`first-${index}`} value={child.firstName} onChange={(e) => updateChild(index, "firstName", e.target.value)} placeholder="Vorname des Kindes" /></div>
                    <div className="field"><label htmlFor={`last-${index}`}>Nachname <span className="required">*</span></label><input id={`last-${index}`} value={child.lastName} onChange={(e) => updateChild(index, "lastName", e.target.value)} placeholder="Nachname des Kindes" /></div>
                    <div className="field full"><label htmlFor={`birth-${index}`}>Geburtsdatum <span className="required">*</span></label><input id={`birth-${index}`} type="date"  value={child.birthDate} onChange={(e) => updateChild(index, "birthDate", e.target.value)} /></div>
                  </div>
                  {isUnder8 && (
                    <div className="companionArea">
                      <p className="tip">👨‍👩‍👧 Kinder unter 8 Jahren basteln mit einer Begleitperson. Diese braucht keinen eigenen Workshopplatz.</p>
                      <div className="field"><label htmlFor={`companion-${index}`}>Name der Begleitperson <span className="required">*</span></label><input id={`companion-${index}`} value={child.companion} onChange={(e) => updateChild(index, "companion", e.target.value)} placeholder="Vorname und Name" disabled={sharedUnder8FieldsLocked} /></div>
                    </div>
                  )}
                  {workshopChoiceLocked && <div className="notice">🔗 Begleitperson und Workshops werden automatisch vom ersten Kind unter 8 Jahren übernommen.</div>}
                  <div className="workshopGrid">
                    <div className="workshopField"><label htmlFor={`slot1-${index}`}><span className="slotNumber">01</span> Zeitfenster 1 <span className="required">*</span></label><select id={`slot1-${index}`} value={child.slot1} onChange={(e) => updateChild(index, "slot1", e.target.value)} disabled={loadingCapacity || workshopChoiceLocked}><option value="">Workshop auswählen</option>{renderWorkshopOptions(1, index)}</select>{child.slot1 && !loadingCapacity && <span className="availabilityNote">{getRemainingPlaces(child.slot1, 1, index) > 0 ? "✓ Plätze verfügbar (Angabe vor Abschluss der Anmeldung)" : "⏳ Aktuell ausgebucht – Warteliste möglich"}</span>}</div>
                    <div className="workshopField"><label htmlFor={`slot2-${index}`}><span className="slotNumber">02</span> Zeitfenster 2 <span className="required">*</span></label><select id={`slot2-${index}`} value={child.slot2} onChange={(e) => updateChild(index, "slot2", e.target.value)} disabled={loadingCapacity || workshopChoiceLocked}><option value="">Workshop auswählen</option>{renderWorkshopOptions(2, index)}</select>{child.slot2 && !loadingCapacity && <span className="availabilityNote">{getRemainingPlaces(child.slot2, 2, index) > 0 ? "✓ Plätze verfügbar (Angabe vor Abschluss der Anmeldung)" : "⏳ Aktuell ausgebucht – Warteliste möglich"}</span>}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="addButton" onClick={addChild}><span className="plus">+</span> Weiteres Kind hinzufügen</button>
        </section>

        <section className="panel infoPanel" aria-labelledby="info-heading">
          <div className="sectionHeading"><span className="step">3</span><div><h2 id="info-heading">Gut zu wissen</h2><p>Die wichtigsten Hinweise zur Anmeldung.</p></div></div>
          <div className="infoItems">
            <div className="infoItem"><span className="infoEmoji">👫</span><div><h3>Gemeinsam basteln unter 8 Jahren</h3><p>Mehrere Kinder unter 8 Jahren in derselben Anmeldung haben dieselbe Begleitperson und besuchen dieselben Workshops. Die Auswahl wird automatisch übernommen.</p></div></div>
            <div className="infoItem"><span className="infoEmoji">🕒</span><div><h3>Warteliste</h3><p>Auch ausgebuchte Workshops können ausgewählt werden. Ist kein Platz mehr frei, wird das Kind für dieses Zeitfenster auf die Warteliste gesetzt.</p></div></div>
            <div className="infoItem"><span className="infoEmoji">📷</span><div><h3>Fotos</h3><p>Während des Bastelnachmittags werden Fotos gemacht. Es werden keine Einzelfotos von Kindern veröffentlicht.</p></div></div>
          </div>
        </section>

        <section className="submitPanel">
          <p>Fast geschafft! Prüfe deine Angaben und sende die Anmeldung ab.</p>
          <button className="submitButton" type="button" onClick={saveRegistration} disabled={saving || loadingCapacity}>{saving ? "Anmeldung wird gespeichert …" : "Jetzt verbindlich anmelden →"}</button>
          <span className="submitSubtext">* Pflichtfelder · Die endgültige Platzvergabe erfolgt beim Speichern.</span>
          {message && <div className={`resultMessage ${isSuccess ? "success" : "error"}`} role="status" aria-live="polite">{message}</div>}
        </section>
        <footer className="footer">Adventsbasteln · Gemeinsam kreativ sein</footer>
      </div>
      <style jsx>{`
        * { box-sizing: border-box; }
        .page { min-height: 100vh; background: #faf8f3; padding: 24px 16px 60px; color: #292e30; font-family: Arial, Helvetica, sans-serif; }
        .shell { max-width: 900px; margin: 0 auto; }
        .hero { background: linear-gradient(125deg,#e5f0ea,#f7eddd); border: 1px solid #e2e9df; border-radius: 24px; padding: 38px 42px 34px; margin-bottom: 22px; position: relative; overflow: hidden; }
        .eyebrow { color: #37694d; font-size: 11px; letter-spacing: 2px; font-weight: 800; margin-bottom: 16px; }
        .heroIcon { position: absolute; right: 45px; top: 38px; font-size: 56px; transform: rotate(-14deg); opacity: .88; }
        h1 { font-size: clamp(32px,5vw,48px); margin: 0 0 12px; color: #264b39; letter-spacing: -1.3px; line-height: 1.12; }
        .heroText { margin: 0; max-width: 580px; font-size: 17px; line-height: 1.55; color: #455b50; }
        .heroPills { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 24px; }
        .heroPills span { background: rgba(255,255,255,.78); border: 1px solid #dce6db; border-radius: 30px; padding: 8px 12px; font-size: 12px; font-weight: 700; color: #3d5b46; }
        .panel { border: 1px solid #e6e6e0; border-radius: 19px; background: white; padding: 30px 34px; margin-bottom: 20px; box-shadow: 0 5px 22px rgba(27,46,34,.035); }
        .sectionHeading { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 25px; }
        .step { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; border-radius: 11px; background: #dcece1; color: #286143; font-size: 16px; font-weight: 800; }
        h2 { font-size: 22px; margin: 3px 0 6px; color: #263b2e; letter-spacing: -.4px; }
        .sectionHeading p { font-size: 14px; margin: 0; color: #68726c; line-height: 1.5; }
        .fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 17px 16px; }
        .field { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
        .field.full { grid-column: 1 / -1; }
        label { display: block; font-weight: 700; color: #344239; font-size: 13px; }
        .required { color: #b05242; }
        input, select { display: block; border: 1px solid #d7ddd6; border-radius: 10px; background: #fff; width: 100%; min-width: 0; padding: 13px 13px; min-height: 46px; font-size: 15px; font-family: inherit; color: #25382e; transition: border-color .15s,box-shadow .15s; }
        input:focus,select:focus { outline: none; border-color: #4b8f65; box-shadow: 0 0 0 3px #d9ede0; }
        input:disabled,select:disabled { color: #666d67; background: #f2f3f0; cursor: not-allowed; }
        .childList { display: flex; flex-direction: column; gap: 18px; }
        .childCard { border: 1px solid #e2e8e0; border-radius: 16px; background: #fdfefd; padding: 22px; }
        .childHeader { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 22px; }
        .childTitle { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .childNumber { display: grid; place-items:center; width: 30px; height: 30px; border-radius: 50%; color: white; background: #487f5b; font-size: 13px; font-weight: 800; }
        h3 { margin: 0; color: #2d4737; font-size: 17px; }
        .ageBadge { padding: 6px 10px; border-radius: 99px; background: #e7f2e8; font-weight: 700; font-size: 12px; color: #3e664d; }
        .removeButton { border: 1px solid #efd7d4; background: #fff; color: #aa534a; border-radius: 9px; cursor:pointer; padding: 9px 11px; font-size: 12px; font-weight: 700; }
        .removeButton:hover { background: #fff1ef; }
        .companionArea { margin-top: 22px; padding: 15px; background: #f0f6ed; border-radius: 12px; }
        .tip { color: #3c624c; margin: 0 0 14px; font-size: 13px; line-height: 1.55; }
        .notice { background:#f0f6ff; color: #385975; border: 1px solid #d6e5f8; padding: 12px 14px; border-radius: 10px; line-height: 1.5; margin: 12px 0; font-size: 13px; }
        .workshopGrid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 15px; margin-top: 23px; }
        .workshopField { min-width: 0; display: flex; flex-direction: column; gap: 9px; }
        .slotNumber { display:inline-block; padding: 4px 7px; border-radius: 6px; margin-right: 4px; background: #e5efe6; color: #2d6b49; font-size: 12px; }
        .availabilityNote { font-size: 11px; color: #68736c; line-height: 1.4; }
        .addButton { display: block; width: 100%; border-radius: 12px; border: 2px dashed #a7c3ac; background: #f5faf6; padding: 14px 12px; font-weight: 800; font-size: 14px; color: #2f6948; cursor: pointer; margin-top: 18px; }
        .addButton:hover { background: #eaf5eb; }
        .plus { font-size: 21px; vertical-align: -2px; margin-right: 4px; }
        .infoItems { display: flex; flex-direction: column; gap: 20px; }
        .infoItem { display: flex; align-items: flex-start; gap: 15px; }
        .infoEmoji { width: 40px; height: 40px; flex: 0 0 40px; display:grid; place-items:center; background: #f2f6ed; border-radius: 12px; font-size: 21px; }
        .infoItem h3 { font-size: 15px; margin: 0 0 5px; }
        .infoItem p { color: #67716a; line-height: 1.6; font-size: 13px; margin: 0; }
        .submitPanel { text-align: center; padding: 25px 22px 10px; }
        .submitPanel > p { color: #536458; font-size: 15px; margin: 0 0 15px; }
        .submitButton { width: 100%; max-width: 480px; border: none; border-radius: 13px; background: #2c7150; color: white; min-height: 54px; padding: 16px 20px; font-size: 16px; font-weight: 800; cursor: pointer; box-shadow: 0 6px 14px #215b3833; }
        .submitButton:hover:not(:disabled) { background: #245e42; }
        .submitButton:disabled { opacity: .58; cursor:not-allowed; }
        .submitSubtext { display:block; font-size: 11px; color: #7a817b; margin: 13px auto; }
        .resultMessage { max-width: 650px; margin: 22px auto 0; border-radius: 12px; border: 1px solid; text-align: left; padding: 16px 18px; line-height: 1.6; font-weight: 700; font-size: 14px; }
        .resultMessage.success { color: #245b3c; background: #e8f6ed; border-color: #afd6bc; }
        .resultMessage.error { color: #8e3d34; background: #fff1ee; border-color: #edc5bf; }
        .footer { padding: 24px 0 0; text-align: center; color: #98a39b; font-size: 12px; }
        @media (max-width: 640px) { .page { padding: 10px 10px 35px; } .hero { padding: 26px 22px; border-radius: 17px; } .heroIcon { position:static; font-size: 32px; margin-bottom: 10px; transform:none; } .heroText { font-size: 15px; } .heroPills { margin-top: 17px; gap: 6px; } .heroPills span { font-size: 11px; padding: 7px 9px; } .panel { padding: 22px 17px; border-radius: 15px; margin-bottom: 12px; } .fields, .workshopGrid { grid-template-columns: minmax(0,1fr); gap: 16px; } .sectionHeading { margin-bottom: 21px; } h2 { font-size: 19px; } .childCard { padding: 16px 13px; } .childHeader { align-items: flex-start; } .removeButton { flex-shrink: 0; } .submitPanel { padding: 22px 8px 8px; } }
      `}</style>
    </main>
  );
}
