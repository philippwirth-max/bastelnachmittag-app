import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

export const instant = false;

function formatDate(
  value: string | null | undefined
) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "de-CH",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

function formatDateTime(
  value: string | null | undefined
) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "de-CH",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function statusLabel(
  value: string | null | undefined
) {
  if (value === "waitlist") {
    return "Warteliste";
  }

  return "Bestätigt";
}

export async function GET() {
  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (
    !supabaseUrl ||
    !supabaseSecretKey
  ) {
    return new Response(
      "Supabase-Konfiguration fehlt.",
      {
        status: 500,
      }
    );
  }

  const supabase =
    createClient(
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

  const {
    data,
    error,
  } = await supabase
    .from("registrations")
    .select("*")
    .order(
      "child_last_name",
      {
        ascending: true,
      }
    )
    .order(
      "child_name",
      {
        ascending: true,
      }
    );

  if (error) {
    return new Response(
      `Fehler beim Laden der Anmeldungen: ${error.message}`,
      {
        status: 500,
      }
    );
  }

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "Bastelnachmittag Admin";

  workbook.created =
    new Date();

  const worksheet =
    workbook.addWorksheet(
      "Anmeldungen"
    );

  worksheet.columns = [
    {
      header: "Vorname Kind",
      key: "child_name",
      width: 20,
    },
    {
      header: "Nachname Kind",
      key: "child_last_name",
      width: 22,
    },
    {
      header: "Geburtsdatum",
      key: "birth_date",
      width: 16,
    },
    {
      header: "Zeitfenster 1",
      key: "workshop_slot1",
      width: 24,
    },
    {
      header: "Status ZF 1",
      key: "workshop_slot1_status",
      width: 16,
    },
    {
      header: "Zeitfenster 2",
      key: "workshop_slot2",
      width: 24,
    },
    {
      header: "Status ZF 2",
      key: "workshop_slot2_status",
      width: 16,
    },
    {
      header: "Begleitperson",
      key: "companion",
      width: 24,
    },
    {
      header: "Kontaktperson",
      key: "parent_name",
      width: 24,
    },
    {
      header: "E-Mail",
      key: "email",
      width: 32,
    },
    {
      header: "Telefon",
      key: "phone",
      width: 20,
    },
    {
      header: "Eingang",
      key: "created_at",
      width: 20,
    },
  ];

  for (
    const registration of
    data ?? []
  ) {
    worksheet.addRow({
      child_name:
        registration.child_name ??
        "",

      child_last_name:
        registration.child_last_name ??
        "",

      birth_date:
        formatDate(
          registration.birth_date
        ),

      workshop_slot1:
        registration.workshop_slot1 ??
        "",

      workshop_slot1_status:
        statusLabel(
          registration.workshop_slot1_status
        ),

      workshop_slot2:
        registration.workshop_slot2 ??
        "",

      workshop_slot2_status:
        statusLabel(
          registration.workshop_slot2_status
        ),

      companion:
        registration.companion ??
        "",

      parent_name:
        registration.parent_name ??
        "",

      email:
        registration.email ??
        "",

      phone:
        registration.phone ??
        "",

      created_at:
        formatDateTime(
          registration.created_at
        ),
    });
  }

  const headerRow =
    worksheet.getRow(1);

  headerRow.font = {
    bold: true,
    color: {
      argb: "FFFFFFFF",
    },
  };

  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: "FF2563EB",
    },
  };

  headerRow.alignment = {
    vertical: "middle",
  };

  headerRow.height = 24;

  worksheet.autoFilter = {
    from: "A1",
    to: "L1",
  };

  worksheet.views = [
    {
      state: "frozen",
      ySplit: 1,
    },
  ];

  worksheet.eachRow(
    (
      row,
      rowNumber
    ) => {
      row.alignment = {
        vertical: "top",
      };

      if (
        rowNumber > 1
      ) {
        row.height = 22;
      }

      row.eachCell(
        (cell) => {
          cell.border = {
            bottom: {
              style: "thin",
              color: {
                argb:
                  "FFE5E7EB",
              },
            },
          };
        }
      );
    }
  );

  /*
    Wartelisten-Zellen leicht hervorheben
  */

  const statusColumns = [
    5,
    7,
  ];

  for (
    let rowNumber = 2;
    rowNumber <=
    worksheet.rowCount;
    rowNumber++
  ) {
    for (
      const columnNumber of
      statusColumns
    ) {
      const cell =
        worksheet.getCell(
          rowNumber,
          columnNumber
        );

      if (
        cell.value ===
        "Warteliste"
      ) {
        cell.font = {
          bold: true,
          color: {
            argb:
              "FF92400E",
          },
        };

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb:
              "FFFEF3C7",
          },
        };
      }

      if (
        cell.value ===
        "Bestätigt"
      ) {
        cell.font = {
          color: {
            argb:
              "FF166534",
          },
        };
      }
    }
  }

  const buffer =
    await workbook.xlsx.writeBuffer();

  return new Response(
    new Uint8Array(buffer),
    {
      status: 200,

      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        "Content-Disposition":
          'attachment; filename="Bastelnachmittag_Anmeldungen.xlsx"',

        "Cache-Control":
          "no-store",
      },
    }
  );
}