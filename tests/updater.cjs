const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runUpdate, readStatus, deliverPending } = require("../updater/worker");
const { staleReason } = require("../updater/watchdog");
const { sendAlert } = require("../updater/notify");
const temp = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hockey-test-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};
test("scrape failure preserves last success and sends actionable email", async (t) => {
    const state = temp(t);
    fs.writeFileSync(
        path.join(state, "status.json"),
        JSON.stringify({ lastSuccess: "2026-09-29T12:00:00Z" }),
    );
    let email;
    const result = await runUpdate({
        state,
        publishing: true,
        scrape: async () => {
            throw new Error("Verification required");
        },
        publishData: () => assert.fail("Must not publish"),
        mail: async (subject, text) => {
            email = { subject, text };
        },
    });
    assert.equal(result.ok, false);
    assert.equal(result.lastSuccess, "2026-09-29T12:00:00Z");
    assert.match(email.text, /Verification required/);
    assert.match(email.text, /6080/);
    assert.equal(result.pendingAlert, undefined);
});
test("Git failure sends email; SMTP failure stays pending and retries", async (t) => {
    const state = temp(t);
    await runUpdate({
        state,
        publishing: true,
        scrape: async () => {},
        publishData: () => {
            throw new Error("Push denied");
        },
        mail: async () => {
            throw new Error("SMTP unavailable");
        },
    });
    let result = readStatus(state);
    assert.equal(result.ok, false);
    assert.equal(result.emailError, "SMTP unavailable");
    assert.match(result.pendingAlert.text, /Push denied/);
    assert.equal(result.lastSuccess, undefined);
    await deliverPending(state, async () => {});
    assert.equal(readStatus(state).pendingAlert, undefined);
});
test("recovery sends an email and marks GitHub push successful", async (t) => {
    const state = temp(t);
    fs.writeFileSync(
        path.join(state, "status.json"),
        JSON.stringify({ ok: false }),
    );
    let subject;
    const result = await runUpdate({
        state,
        publishing: true,
        scrape: async () => {},
        publishData: () => {},
        mail: async (s) => {
            subject = s;
        },
    });
    assert.equal(result.ok, true);
    assert.ok(result.lastPublishedAt);
    assert.match(subject, /recovered/);
});
test("watchdog flags old, invalid and wrong-season timestamps", () => {
    const now = Date.now();
    const data = {
        source: "https://myhockeyrankings.com/rank.php?y=2026&v=114",
        scrapedAt: new Date(now).toISOString(),
        teams: [{}],
    };
    assert.equal(staleReason(data, now), null);
    assert.match(
        staleReason(
            { ...data, scrapedAt: new Date(now - 31 * 3600000).toISOString() },
            now,
        ),
        /30 hours/,
    );
    assert.ok(staleReason({ ...data, source: "https://example.com" }, now));
    assert.ok(staleReason({ ...data, scrapedAt: "invalid" }, now));
});
test("SMTP uses TLS, correct recipient and detects rejected delivery", async () => {
    const env = {
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "user@example.com",
        SMTP_PASSWORD: "test-only",
        SMTP_FROM: "user@example.com",
        ALERT_TO: "recipient@example.com",
    };
    let config, message;
    await sendAlert("Test", "Body", env, (c) => {
        config = c;
        return {
            sendMail: async (m) => {
                message = m;
                return { accepted: [env.ALERT_TO], rejected: [] };
            },
        };
    });
    assert.equal(config.secure, true);
    assert.equal(message.to, env.ALERT_TO);
    await assert.rejects(
        () =>
            sendAlert("Test", "Body", env, () => ({
                sendMail: async () => ({
                    accepted: [],
                    rejected: [env.ALERT_TO],
                }),
            })),
        /accept/,
    );
});
