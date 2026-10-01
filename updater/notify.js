const fs = require("node:fs");
function mailConfig(env = process.env) {
    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_FROM", "ALERT_TO"].filter(
        (key) => !env[key],
    );
    if (missing.length)
        throw new Error(`Email is not configured: ${missing.join(", ")}`);
    const password =
        env.SMTP_PASSWORD ||
        fs
            .readFileSync(
                env.SMTP_PASSWORD_FILE || "/run/secrets/smtp_password",
                "utf8",
            )
            .trim();
    if (!password) throw new Error("SMTP password is empty");
    return {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: env.SMTP_SECURE === "true",
        requireTLS: env.SMTP_SECURE !== "true",
        auth: { user: env.SMTP_USER, pass: password },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
    };
}
async function sendAlert(
    subject,
    text,
    env = process.env,
    makeTransport = require("nodemailer").createTransport,
) {
    const transport = makeTransport(mailConfig(env));
    const result = await transport.sendMail({
        from: env.SMTP_FROM,
        to: env.ALERT_TO,
        subject,
        text,
    });
    if (!result.accepted?.length || result.rejected?.length)
        throw new Error("SMTP did not accept the alert recipient");
    return result;
}
module.exports = { sendAlert, mailConfig };
if (require.main === module)
    sendAlert(
        "Hockey calculator: email test",
        "Failure notifications are configured. This is a test message.",
    )
        .then(() => console.log("Test email accepted by SMTP server."))
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
