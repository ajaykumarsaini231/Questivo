import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const oauth2Client =
new google.auth.OAuth2(
process.env.GOOGLE_CLIENT_ID,
process.env.GOOGLE_CLIENT_SECRET,
process.env.GOOGLE_REDIRECT_URI
);

const url =
oauth2Client.generateAuthUrl({
access_type: "offline",
scope: [
"https://www.googleapis.com/auth/gmail.send"
],
prompt: "consent"
});

console.log(url);