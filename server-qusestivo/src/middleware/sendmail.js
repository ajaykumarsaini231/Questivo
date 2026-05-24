import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const oauth2Client =
new google.auth.OAuth2(
process.env.GOOGLE_CLIENT_ID,
process.env.GOOGLE_CLIENT_SECRET,
process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
refresh_token:
process.env.GOOGLE_REFRESH_TOKEN
});

const gmail =
google.gmail({
version:"v1",
auth:oauth2Client
});

export const transport = {

async sendMail({
to,
subject,
html
}){

const message = [

`From: Questivo <${process.env.MAIL_FROM}>`,
`To: ${to}`,
`Subject: ${subject}`,
"MIME-Version: 1.0",
"Content-Type: text/html; charset=UTF-8",
"",
html

].join("\n");

const encoded =
Buffer
.from(message)
.toString("base64")
.replace(/\+/g,"-")
.replace(/\//g,"_")
.replace(/=+$/,"");

await gmail.users.messages.send({
userId:"me",
requestBody:{
raw:encoded
}
});

return true;

}

};