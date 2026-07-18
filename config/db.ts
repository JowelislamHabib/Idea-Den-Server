import "dotenv/config";
import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";

let client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});

const db = client.db("IdeaDen");

export const ideasCollection = db.collection("ideas");
export const blogsCollection = db.collection("blogs");
export const usersCollection = db.collection("user");

let dbConnected = false;
let connecting: Promise<void> | null = null;

export async function ensureConnected() {
  if (dbConnected) return;
  if (!connecting) {
    connecting = client.connect().then(() => {
      dbConnected = true;
    });
  }
  await connecting;
}

export { client, db };
