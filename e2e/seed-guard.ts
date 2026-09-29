const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function assertLocalMongo(uri: string | undefined): string {
    let url: URL;
    try {
        url = new URL(uri ?? "");
    } catch {
        throw new Error("Refusing to seed: MONGODB_URI is missing or unparsable");
    }
    if (url.protocol !== "mongodb:" || !LOCAL_HOSTS.has(url.hostname)) {
        throw new Error(`Refusing to seed a non-local database (${url.protocol}//${url.hostname})`);
    }
    return uri!;
}
