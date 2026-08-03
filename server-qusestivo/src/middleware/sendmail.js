/**
 * Mail transport used by the auth flows (login OTP, verification, reset).
 *
 * This used to be a SECOND, independent mail implementation that called the
 * Gmail API directly with an OAuth2 client, while config/gmail.js used
 * nodemailer. Two transports meant two ways to fail: fixing one left the other
 * broken, which is exactly what happened — login OTP kept dying with
 * invalid_grant after the mail routes were already working.
 *
 * There is now one transport. config/gmail.js prefers an App Password over
 * OAuth precisely so it cannot expire every 7 days; this module is a thin
 * adapter that keeps the `transport.sendMail({to, subject, html})` shape the
 * auth controllers already call.
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
