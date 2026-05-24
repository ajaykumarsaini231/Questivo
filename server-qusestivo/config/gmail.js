import nodemailer from "nodemailer";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

export async function sendMail(to, subject, html) {
    const accessToken =
        await oauth2Client.getAccessToken();

    const transporter =
        nodemailer.createTransport({
            service: "gmail",
            auth: {
                type: "OAuth2",
                user: process.env.MAIL_FROM,
                clientId:
                    process.env.GOOGLE_CLIENT_ID,
                clientSecret:
                    process.env.GOOGLE_CLIENT_SECRET,
                refreshToken:
                    process.env.GOOGLE_REFRESH_TOKEN,
                accessToken:
                    accessToken.token,
            },
        });

    return transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject,
        html,
    });
}