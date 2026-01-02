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
    .setProject("694957a0001a0479bd64"); // PROJECT ID

export const account = new Account(client);
export const db = new Databases(client);

// IDs
export const DATABASE_ID = "6949590f0022a0f4370a";      // trading_db
export const SETTINGS_COL = "69495c37000f41ab237f";    // user_settings table

export { ID, Permission, Role };

// expose to window for non-module scripts (settings.js gibi)
window.client = client;
window.account = account;
window.db = db;
