import {
    Client,
    Account,
    Databases,
    ID,
    Permission,
    Role
} from "https://cdn.jsdelivr.net/npm/appwrite@14.0.1/+esm";

export const client = new Client()
    .setEndpoint("https://cloud.appwrite.io/v1")
    .setProject("694957a0001a0479bd64");

export const account = new Account(client);
export const db = new Databases(client);

export const DATABASE_ID = "6949590f0022a0f4370a";
export const SETTINGS_COL = "69495c37000f41ab237f";

export { ID, Permission, Role };

// ✅ Only if running in browser
if (typeof window !== "undefined") {
    window.client = client;
    window.account = account;
    window.db = db;
}
