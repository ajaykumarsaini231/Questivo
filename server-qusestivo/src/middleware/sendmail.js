/**
 * Mail transport used by the auth flows (login OTP, verification, reset).
 *
 * This was once a SECOND, independent mail implementation sitting alongside
 * config/gmail.js. Two transports meant two ways to fail, and fixing one left
 * the other broken — login OTP kept dying while the mail routes looked fine.
 *
 * There is now one transport: config/gmail.js, sending through the Gmail REST
 * API over HTTPS (the same approach as the METNMAT dashboard). This module is
 * a thin adapter preserving the `transport.sendMail({to, subject, html})`
 * shape the auth controllers already call.
 */
import { sendMail as send, verifyMailTransport } from "../../config/gmail.js";

export const transport = {
  async sendMail({ to, subject, html }) {
    await send(to, subject, html);
    return true;
  },
};

export { verifyMailTransport };
export default transport;
