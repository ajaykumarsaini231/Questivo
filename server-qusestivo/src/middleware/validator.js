import Joi from 'joi';
export const signupSchema = Joi.object({
    name:Joi.string()
    .required(),

    email: Joi.string()
        .min(6)
        .max(60)
        .required()
        .email({ tlds: { allow: ['com', 'net','in'] } }),

    password: Joi.string()
        .required()
        .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$"))
       
});

export const signinSchema = Joi.object({
    email: Joi.string()
        .min(6)
        .max(60)
        .required()
        .email({ tlds: { allow: ['com', 'net','in'] } }),

    password: Joi.string()
        .required()
        .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$"))
        
});

export const acceptCodeSchema = Joi.object({
    email: Joi.string()
        .min(6)
        .max(60)
        .required()
        .email({ tlds: { allow: ['com', 'net'] } }),

        varificationCode: Joi.number()
        .required()
                
});
export const passwordSchema = Joi.object({
    oldpassword: Joi.string()
        .required()
        .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$")),

    newpassword: Joi.string()
        .required()
        .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$"))
        
});

export const acceptforgotCodeSchema = Joi.object({
    email: Joi.string()
        .min(6)
        .max(60)
        .required()
        .email({ tlds: { allow: ['com', 'net'] } }),

        varificationCode: Joi.number()
        .required(),

        newpassword: Joi.string()
        .required()
        .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$"))
    
                
});



export const postValidatort = Joi.object({
    title:Joi.string().min(6).max(600).required(),
    description:Joi.string().min(6).required(),
    userId:Joi.string().required()
    
})

export const messageSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string()
        .min(6)
        .max(60)
        .required()
        .email({ tlds: { allow: ['com', 'net', 'in'] } }),
    subject: Joi.string().min(3).max(200).required(),
    message: Joi.string().min(6).max(1000).required(),
});

/**
 * The one place a new password is judged.
 *
 * signupSchema already required a mix of cases and a digit at 8+ characters,
 * but the password RESET path validated nothing at all: verifyResetOtp took
 * `newPassword` from the body and hashed it. So the strength rule the signup
 * form enforced could be walked straight past by resetting to "a" — and the
 * user who did that was then locked out anyway, because signinSchema applies
 * the pattern to the password being SUBMITTED and would reject their own new
 * one. A rule enforced on one of the two ways a password can be set is not a
 * rule; it is a suggestion with an outage attached.
 *
 * Same pattern as signup so there is exactly one definition of "strong enough",
 * with the message spelled out — the raw regex failure reads as gibberish to
 * anyone who has to act on it.
 */
export const passwordStrengthSchema = Joi.object({
    password: Joi.string()
        .required()
        .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$"))
        .messages({
            "string.pattern.base":
                "Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number.",
            "string.empty": "Password is required.",
            "any.required": "Password is required.",
        }),
});

/**
 * The "we don't cover this exam yet" form.
 *
 * Public and unauthenticated by design — the point is to hear from someone who
 * is not a user yet. What it had was `String(req.body.examName || "").trim()`
 * and a minimum length, and nothing else: no maximum on the name or the note,
 * and no check at all on the email, which was written to the row verbatim.
 * With ten requests an hour per address, that is an anonymous caller storing
 * whatever the body parser will carry, and an "email" column that cannot be
 * trusted to hold an email — including by whoever later writes the code that
 * mails these people back.
 *
 * The maxima are what a person actually types, not what a column can hold.
 * Email is optional because the form does not require one; it is validated
 * when present.
 */
export const courseRequestSchema = Joi.object({
    examName: Joi.string().trim().min(2).max(120).required()
        .messages({
            "string.min": "Please name the exam.",
            "string.max": "That exam name is too long.",
            "any.required": "Please name the exam.",
            "string.empty": "Please name the exam.",
        }),
    email: Joi.string().trim().lowercase().max(120).email({ tlds: false }).allow("", null).optional()
        .messages({ "string.email": "That does not look like an email address." }),
    note: Joi.string().trim().max(1000).allow("", null).optional()
        .messages({ "string.max": "Please keep the note under 1000 characters." }),
}).unknown(true);

/**
 * Fields a user may change on their own profile.
 *
 * updateProfile destructured six fields and validated exactly one of them
 * (audienceId). The rest went to the database as they arrived — unbounded
 * `name` and `bio`, and a `photoUrl` that was never required to be a URL at
 * all. That last one is rendered as the avatar's src in the header, so it is
 * the one worth being strict about: restricting it to http(s) keeps `javascript:`
 * and `data:` URLs out of an attribute the browser will act on.
 *
 * audienceId and focusExam are checked in the controller against the real
 * lists, which this schema has no business duplicating.
 */
export const profileUpdateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(80).optional()
        .messages({ "string.max": "Name must be 80 characters or fewer." }),
    bio: Joi.string().trim().max(500).allow("", null).optional()
        .messages({ "string.max": "Bio must be 500 characters or fewer." }),
    photoUrl: Joi.string().trim().uri({ scheme: ["http", "https"] }).max(500).allow("", null).optional()
        .messages({
            "string.uri": "Photo URL must be a http:// or https:// link.",
            "string.max": "That photo URL is too long.",
        }),
    preferredMedium: Joi.string().trim().max(40).optional(),
}).unknown(true);
