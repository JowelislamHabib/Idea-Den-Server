import "dotenv/config";
import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("IdeaDen");

export const ideasCollection = db.collection("ideas");
export const blogsCollection = db.collection("blogs");
export const usersCollection = db.collection("user");

export { client, db };
