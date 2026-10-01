import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const QUERY_SHAPE =
    /^(avg|sum|min|max)\(last_\d+h\):(avg|sum|min|max):[a-z][a-z0-9_.]*\{[a-z0-9_:,.!-]+\}( by \{[a-z_]+(,[a-z_]+)*\})?(\.as_count\(\))? (<|>|<=|>=) -?\d+$/;

export function loadMonitors(file, notify = "") {
    const monitors = JSON.parse(readFileSync(file, "utf8"));
    return monitors.map((m) => ({ ...m, message: notify ? `${m.message} ${notify}` : m.message }));
}

export async function syncMonitors(monitors, { site, token, fetchImpl = fetch, log = console.log }) {
    const base = `https://api.${site}/api/v1/monitor`;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    for (const monitor of monitors) {
        const list = await fetchImpl(`${base}?name=${encodeURIComponent(monitor.name)}`, { headers });
        if (!list.ok) throw new Error(`Listing monitors failed (${list.status}): ${await list.text()}`);
        const existing = (await list.json()).find((m) => m.name === monitor.name);

        const editable = { ...monitor };
        delete editable.type;
        const res = existing
            ? await fetchImpl(`${base}/${existing.id}`, { method: "PUT", headers, body: JSON.stringify(editable) })
            : await fetchImpl(base, { method: "POST", headers, body: JSON.stringify(monitor) });
        if (!res.ok) {
            throw new Error(`${existing ? "Updating" : "Creating"} "${monitor.name}" failed (${res.status}): ${await res.text()}`);
        }

        const saved = await res.json();
        log(`${existing ? "updated" : "created"} ${saved.id} ${monitor.name}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const token = process.env.DD_BEARER_TOKEN;
    if (!token) {
        console.error("Set DD_BEARER_TOKEN to a Datadog Personal or Service Access Token.");
        process.exit(1);
    }
    const file = new URL("../datadog/monitors.json", import.meta.url);
    await syncMonitors(loadMonitors(file, process.env.DD_NOTIFY ?? ""), {
        site: process.env.DD_SITE || "datadoghq.com",
        token,
    });
}
