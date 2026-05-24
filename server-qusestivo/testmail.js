import { transport }
from "./src/middleware/sendmail.js";

await transport.sendMail({
to:
"nabalkishorsaini231@gmail.com",

subject:
"Questivo Test",

html:
"<h1>Working</h1>"
});

console.log(
"MAIL SENT"
);