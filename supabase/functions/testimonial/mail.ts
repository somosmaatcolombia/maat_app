// Correos de la funcion `testimonial` (texto puro: sin imports remotos, se prueba con node --test).
import { escHtml, type Lang } from "./lib.ts";

export type Mail = { subject: string; html: string; text: string };

const shell = (body: string) =>
  `<div style="font:16px/1.6 Arial,sans-serif;color:#2a2030;max-width:560px;margin:0 auto;padding:24px">${body}` +
  `<p style="margin-top:28px;font-size:13px;color:#8a7d8c">MAAT · somosmaat.org</p></div>`;

/** Para quien envio el testimonio: confirmacion + su enlace privado para editar o retirar. */
export function personMail(lang: Lang, name: string, manageUrl: string): Mail {
  const first = name.split(" ")[0];
  if (lang === "en") {
    return {
      subject: "We received your testimonial",
      text: `Hi ${first},\n\nThank you for sharing your experience. We review every testimonial before publishing it.\n\n` +
        `This private link lets you edit or withdraw it any time (keep it safe, anyone with it can change your testimonial):\n${manageUrl}\n\nMAAT`,
      html: shell(`<p>Hi ${escHtml(first)},</p><p>Thank you for sharing your experience. We review every testimonial before publishing it.</p>` +
        `<p>This private link lets you <strong>edit or withdraw</strong> it any time. Keep it safe: anyone with it can change your testimonial.</p>` +
        `<p><a href="${escHtml(manageUrl)}" style="background:#896C8E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;display:inline-block">Manage my testimonial</a></p>`),
    };
  }
  return {
    subject: "Recibimos tu testimonio",
    text: `Hola ${first},\n\nGracias por compartir tu experiencia. Revisamos cada testimonio antes de publicarlo.\n\n` +
      `Con este enlace privado puedes editarlo o retirarlo cuando quieras (guardalo bien: quien lo tenga puede cambiar tu testimonio):\n${manageUrl}\n\nMAAT`,
    html: shell(`<p>Hola ${escHtml(first)},</p><p>Gracias por compartir tu experiencia. Revisamos cada testimonio antes de publicarlo.</p>` +
      `<p>Con este enlace privado puedes <strong>editarlo o retirarlo</strong> cuando quieras. Guardalo bien: quien lo tenga puede cambiar tu testimonio.</p>` +
      `<p><a href="${escHtml(manageUrl)}" style="background:#896C8E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;display:inline-block">Gestionar mi testimonio</a></p>`),
  };
}

type StaffRow = { name: string; role: string; location: string; quote: string; lang: Lang; matched_user_id: string | null };

/** Para MAAT: hay algo por revisar. Si el correo coincide con un cliente, se avisa para cruzarlo con su feedback. */
export function staffMail(kind: "new" | "updated", row: StaffRow, panelUrl: string): Mail {
  const what = kind === "new" ? "Nuevo testimonio por revisar" : "Testimonio editado, vuelve a revision";
  const who = `${row.name} · ${row.role} · ${row.location}`;
  const client = row.matched_user_id
    ? "Coincide con un cliente de la app: en el panel veras su satisfaccion y NPS."
    : "No coincide con ningun cliente de la app (puede ser de antes de la app): verificalo tu.";
  const excerpt = row.quote.length > 400 ? row.quote.slice(0, 400) + "..." : row.quote;
  return {
    subject: `${what}: ${row.name}`,
    text: `${what}\n\n${who} (${row.lang.toUpperCase()})\n${client}\n\n"${excerpt}"\n\nRevisar y aprobar: ${panelUrl}`,
    html: shell(`<p><strong>${escHtml(what)}</strong></p><p>${escHtml(who)} (${row.lang.toUpperCase()})<br>${escHtml(client)}</p>` +
      `<blockquote style="margin:16px 0;padding:8px 16px;border-left:3px solid #896C8E;color:#5a4f5e">${escHtml(excerpt).replace(/\n/g, "<br>")}</blockquote>` +
      `<p><a href="${escHtml(panelUrl)}" style="background:#896C8E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;display:inline-block">Revisar y aprobar</a></p>`),
  };
}
