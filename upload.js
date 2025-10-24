import fetch from "node-fetch";

// -----------------
// CONFIG
// -----------------
const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST; // e.g., "https://xxxx.up.railway.app"
const MEILISEARCH_MASTER_KEY = process.env.MEILISEARCH_MASTER_KEY;
const SHEET_URL = process.env.SHEET_URL; // Your published CSV URL

// -----------------
// STEP 1: Fetch CSV & convert to JSON
// -----------------
async function getSheetData() {
  const res = await fetch(SHEET_URL);
  if (!res.ok) throw new Error("Failed to fetch Google Sheet CSV");
  const text = await res.text();
  const rows = text.split("\n").map(r => r.split(","));
  const headers = rows.shift().map(h => h.trim());
  const data = rows
    .map(row => {
      let obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]?.trim()));
      return obj;
    })
    .filter(item => item.id && item.title); // only valid entries
  console.log(`📄 Fetched ${data.length} rows from Google Sheet`);
  return data;
}

// -----------------
// STEP 2: Upload to Meilisearch
// -----------------
async function uploadToMeili(data) {
  // 1️⃣ Create index safely
  const createIndex = await fetch(`${MEILISEARCH_HOST}/indexes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MEILISEARCH_MASTER_KEY}`, // ✅ CHANGED
    },
    body: JSON.stringify({
      uid: "manhwa",
      primaryKey: "id",
    }),
  });
  
  if (!createIndex.ok && createIndex.status !== 409) {
    const errorText = await createIndex.text();
    console.error("❌ Failed to create index:", errorText);
    throw new Error(errorText);
  } else if (createIndex.status === 409) {
    console.log("ℹ️ Index already exists, continuing...");
  } else {
    console.log("✅ Index created successfully!");
  }

  // 2️⃣ Upload documents
  const uploadResponse = await fetch(`${MEILISEARCH_HOST}/indexes/manhwa/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MEILISEARCH_MASTER_KEY}`, // ✅ CHANGED
    },
    body: JSON.stringify(data),
  });
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error("❌ Upload failed:", errorText);
    throw new Error(errorText);
  }
  
  const uploadResult = await uploadResponse.json();
  console.log(`✅ Uploaded ${data.length} documents. Task UID:`, uploadResult.taskUid);

  // 3️⃣ Update searchable + displayed attributes
  const settingsResponse = await fetch(`${MEILISEARCH_HOST}/indexes/manhwa/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MEILISEARCH_MASTER_KEY}`, // ✅ CHANGED
    },
    body: JSON.stringify({
      searchableAttributes: ["title", "status", "genre", "description", "tags"],
      displayedAttributes: [
        "id",
        "title",
        "cover_image",
        "status",
        "chapters",
        "genre",
        "description",
        "official_site",
        "tags",
      ],
    }),
  });
  
  if (!settingsResponse.ok) {
    const errorText = await settingsResponse.text();
    console.error("❌ Failed to update settings:", errorText);
  } else {
    console.log("⚙️ Settings updated successfully!");
  }
}

// -----------------
// MAIN
// -----------------
(async () => {
  try {
    console.log("🚀 Starting upload script...");
    const data = await getSheetData();
    await uploadToMeili(data);
    console.log("🎉 All done!");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
