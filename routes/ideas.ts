import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { ideasCollection } from "../config/db";
import { verifyToken } from "../middleware/verifyToken";
import { generateRandomIdeaPrompt } from "../services/gemini";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "12",
      q,
      difficulty,
      estimatedDuration,
      sort = "newest",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 12));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = { visibility: "public" };

    if (q && typeof q === "string") {
      filter.$or = [
        { projectTitle: { $regex: q, $options: "i" } },
        { elevatorPitch: { $regex: q, $options: "i" } },
      ];
    }

    if (estimatedDuration && typeof estimatedDuration === "string" && estimatedDuration !== "all") {
      let regexStr = estimatedDuration;
      if (estimatedDuration === "1-week") {
        regexStr = "1[- ]week|one week|7 days";
      } else if (estimatedDuration === "2-weeks") {
        regexStr = "2[- ]week|two week|14 days";
      } else if (estimatedDuration === "1-month") {
        regexStr = "1[- ]month|one month|4[- ]week";
      } else if (estimatedDuration === "2-months") {
        regexStr = "2[- ]month|two month|8[- ]week";
      }
      filter.estimatedDuration = { $regex: regexStr, $options: "i" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortOption: any =
      sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

    const [ideas, total] = await Promise.all([
      ideasCollection
        .find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      ideasCollection.countDocuments(filter),
    ]);

    res.json({
      ideas,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error listing ideas:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/mine", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ideas = await ideasCollection
      .find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ ideas });
  } catch (error) {
    console.error("Error fetching user ideas:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/quota", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userRole = (req as any).user.role || "free";
    const isPro = userRole === "pro";

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = await ideasCollection.countDocuments({ 
      ownerId: userId,
      createdAt: { $gte: startOfDay }
    });

    res.json({ count, limit: 3, isPro });
  } catch (error) {
    console.error("Error fetching quota:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/random", verifyToken, async (req: Request, res: Response) => {
  try {
    const idea = await generateRandomIdeaPrompt();
    res.json({ idea });
  } catch (error) {
    console.error("Error generating random idea:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid ID format" });
      return;
    }

    const idea = await ideasCollection.findOne({ _id: new ObjectId(id) });

    if (!idea) {
      res.status(404).json({ error: "Blueprint not found" });
      return;
    }

    let related: any[] = [];
    if (idea.techStack && Array.isArray(idea.techStack) && idea.techStack.length > 0) {
      // Create case-insensitive regex for better matching
      const techRegexes = idea.techStack.map(
        (t: string) => new RegExp(`^${t.trim()}$`, 'i')
      );
      
      related = await ideasCollection
        .find({
          _id: { $ne: new ObjectId(id) },
          visibility: "public",
          techStack: { $in: techRegexes }
        })
        .limit(3)
        .toArray();
    }

    if (related.length < 3) {
      const existingIds = [new ObjectId(id), ...related.map(r => r._id)];
      const backfill = await ideasCollection
        .find({
          _id: { $nin: existingIds },
          visibility: "public"
        })
        .limit(3 - related.length)
        .toArray();
      related = [...related, ...backfill];
    }

    res.json({ idea, related });
  } catch (error) {
    console.error("Error fetching idea:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.sub;

    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid ID format" });
      return;
    }

    const idea = await ideasCollection.findOne({ _id: new ObjectId(id) });

    if (!idea) {
      res.status(404).json({ error: "Blueprint not found" });
      return;
    }

    if (idea.ownerId?.toString() !== userId?.toString()) {
      res.status(403).json({ error: "Forbidden: You can only delete your own blueprints" });
      return;
    }

    await ideasCollection.deleteOne({ _id: new ObjectId(id) });

    res.json({ success: true, message: "Blueprint deleted" });
  } catch (error) {
    console.error("Error deleting idea:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
