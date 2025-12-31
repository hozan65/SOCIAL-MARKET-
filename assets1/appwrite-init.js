// /assets1/appwrite-init.js
(() => {
    // Appwrite SDK yüklü mü?
    if (!window.Appwrite) {
        console.error("❌ Appwrite SDK not found. Include appwrite CDN before this file.");
        return;
    }

    const client = new window.Appwrite.Client()
        .setEndpoint(window.APPWRITE_ENDPOINT)   // örn: "https://cloud.appwrite.io/v1"
        .setProject(window.APPWRITE_PROJECT_ID); // örn: "xxxxx"

    const account = new window.Appwrite.Account(client);

    // ✅ globals
    window.appwrite = { client, account };
    window.account = account;

    console.log("✅ Appwrite initialized (window.account ready)");
})();
