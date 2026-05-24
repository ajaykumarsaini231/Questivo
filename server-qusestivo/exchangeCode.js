import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const fullUrl =
'http://localhost:4000/oauth2callback?iss=https://accounts.google.com&code=4/0AeoWuM9efbW2LJJFHPC22BZX3jAv9qiA4D7meKk6jI_CtLmkq_n2kQRcTqzbg9mw0lNwPQ&scope=https://www.googleapis.com/auth/gmail.send'
const code =
new URL(fullUrl)
.searchParams
.get("code");

const oauth2Client =
new google.auth.OAuth2(
process.env.GOOGLE_CLIENT_ID,
process.env.GOOGLE_CLIENT_SECRET,
process.env.GOOGLE_REDIRECT_URI
);

const { tokens } =
await oauth2Client.getToken(
code
);

console.log(tokens);