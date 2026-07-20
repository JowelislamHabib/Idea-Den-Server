import { Router, type Request, type Response } from "express";
import { generateBlueprint, type BlueprintInput } from "../services/gemini";
import { ideasCollection } from "../config/db";
import { verifyToken } from "../middleware/verifyToken";

const router = Router();

const rateLimitMap = new Map<string, number>();
const COOLDOWN_MS = 15_000;

router.post("/generate", verifyToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.sub;
    const interests = req.body.interests;
    const timeAvailable = req.body.timeAvailable;
    const techStack = req.body.techStack;

    let visibility = req.body.visibility;
    if (visibility !== "public" && visibility !== "private") {
      visibility = "public";
    }

    if (!interests || typeof interests !== "string" || interests.trim().length === 0) {
      res.status(400).json({ error: "Interests or Industry is required" });
      return;
    }

    if (!timeAvailable || typeof timeAvailable !== "string") {
      res.status(400).json({ error: "Time available is required" });
      return;
    }

    if (
      !Array.isArray(techStack) ||
      techStack.length === 0 ||
      !techStack.every((t: unknown) => typeof t === "string")
    ) {
      res.status(400).json({ error: "At least one tech stack item is required" });
      return;
    }

    const lastGen = rateLimitMap.get(userId.toString()) || 0;
    const now = Date.now();
    if (now - lastGen < COOLDOWN_MS) {
      const waitSeconds = Math.ceil((COOLDOWN_MS - (now - lastGen)) / 1000);
      res.status(429).json({
        error: `Please wait ${waitSeconds} seconds before generating again`,
      });
      return;
    }

    rateLimitMap.set(userId.toString(), now);

    let userRole = "free";
    let userName = "";
    let userEmail = "";
    let developerPreferences: BlueprintInput["developerPreferences"];

    try {
      const { usersCollection } = await import("../config/db");
      const { ObjectId } = await import("mongodb");

      let dbUser;
      if (ObjectId.isValid(userId)) {
        dbUser = await usersCollection.findOne({
          $or: [{ _id: new ObjectId(userId) }, { id: userId }],
        });
      } else {
        dbUser = await usersCollection.findOne({ id: userId });
      }

      if (dbUser) {
        userRole = dbUser.role || "free";
        userName = dbUser.name || user.name || "";
        userEmail = dbUser.email || user.email || "";
        if (dbUser.developerPreferences) {
          developerPreferences = dbUser.developerPreferences;
        }
      }
    } catch (err) {
      console.error("Error fetching user for quota check:", err);
      userName = user.name || "";
      userEmail = user.email || "";
    }

    if (userRole !== "pro") {
      visibility = "public";
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayCount = await ideasCollection.countDocuments({
        ownerId: userId.toString(),
        createdAt: { $gte: startOfDay }
      });

      if (todayCount >= 3) {
        res.status(403).json({ 
          error: "You have reached your free limit of 3 generated ideas per day. Upgrade to Pro for unlimited generation." 
        });
        return;
      }
    }

    let previousIdeas: string[] = [];
    try {
      const recentIdeas = await ideasCollection
        .find({ ownerId: userId.toString() })
        .sort({ createdAt: -1 })
        .limit(5)
        .project({ projectTitle: 1 })
        .toArray();
      
      previousIdeas = recentIdeas
        .map(i => i.projectTitle)
        .filter(Boolean) as string[];
    } catch (err) {
      console.error("Error fetching previous ideas for deduplication:", err);
    }

    const blueprint = await generateBlueprint({
      interests: interests.trim(),
      timeAvailable,
      techStack: techStack.map((t: string) => t.trim()),
      developerPreferences,
      previousIdeas,
    });

    const ideaDoc = {
      ...blueprint,
      ownerId: userId.toString(),
      ownerName: userName || "Anonymous",
      ownerEmail: userEmail || "",
      visibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await ideasCollection.insertOne(ideaDoc);

    res.status(201).json({
      success: true,
      idea: { ...ideaDoc, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error generating blueprint:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate project idea. Please try again." });
  }
});

export default router;
