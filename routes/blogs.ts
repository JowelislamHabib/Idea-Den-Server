import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { blogsCollection, usersCollection } from "../config/db";
import { generateBlog, generateRandomBlogTopicPrompt, type BlogInput } from "../services/gemini-blog";
import { verifyToken } from "../middleware/verifyToken";

const router = Router();

const rateLimitMap = new Map<string, number>();
const COOLDOWN_MS = 15_000;

router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "12",
      q,
      template,
      sort = "newest",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 12));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = { visibility: { $ne: "private" } };

    if (q && typeof q === "string") {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { topic: { $regex: q, $options: "i" } },
      ];
    }

    if (template && typeof template === "string" && template !== "all") {
      filter.template = template;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortOption: any =
      sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

    const [blogs, total] = await Promise.all([
      blogsCollection
        .find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      blogsCollection.countDocuments(filter),
    ]);

    res.json({
      blogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error listing blogs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/generate", verifyToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.sub;
    const { topic, template, tone, length, keywords, additionalInstructions, regenerateId } = req.body;
    let visibility = req.body.visibility;
    if (visibility !== "public" && visibility !== "private") {
      visibility = "public";
    }

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      res.status(400).json({ error: "Topic is required" });
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
    try {
      const { usersCollection } = await import("../config/db");
      const { ObjectId: OId } = await import("mongodb");
      let dbUser;
      if (OId.isValid(userId)) {
        dbUser = await usersCollection.findOne({
          $or: [{ _id: new OId(userId) }, { id: userId }],
        });
      } else {
        dbUser = await usersCollection.findOne({ id: userId });
      }
      if (dbUser) {
        userRole = dbUser.role || "free";
        userName = dbUser.name || user.name || "";
        userEmail = dbUser.email || user.email || "";
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

      const todayCount = await blogsCollection.countDocuments({
        ownerId: userId.toString(),
        createdAt: { $gte: startOfDay }
      });

      if (todayCount >= 3) {
        res.status(403).json({ 
          error: "You have reached your free limit of 3 generated blogs per day. Upgrade to Pro for unlimited generation." 
        });
        return;
      }
    }

    let previousBlogs: string[] = [];
    if (regenerateId && ObjectId.isValid(regenerateId)) {
      try {
        const oldBlog = await blogsCollection.findOne({ _id: new ObjectId(regenerateId) });
        if (oldBlog) previousBlogs.push(oldBlog.content);
      } catch (e) {}
    }

    const blogContent = await generateBlog({
      topic: topic.trim(),
      template: template || "Standard Article",
      tone: tone || "Professional",
      length: length || "Medium",
      keywords: keywords || [],
      additionalInstructions,
      previousBlogs,
    });

    const blogDoc = {
      ...blogContent,
      ownerId: userId.toString(),
      ownerName: userName || "Anonymous",
      ownerEmail: userEmail || "",
      topic: topic.trim(),
      template: template || "Standard Article",
      tone: tone || "Professional",
      length: length || "Medium",
      keywords: keywords || [],
      visibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (regenerateId && ObjectId.isValid(regenerateId)) {
      await blogsCollection.updateOne(
        { _id: new ObjectId(regenerateId), ownerId: userId.toString() },
        { $set: { 
            title: blogDoc.title, 
            seoMetaDescription: blogDoc.seoMetaDescription, 
            content: blogDoc.content, 
            updatedAt: new Date() 
          } 
        }
      );
      res.status(200).json({
        success: true,
        blog: { ...blogDoc, _id: regenerateId },
      });
    } else {
      const result = await blogsCollection.insertOne(blogDoc);
      res.status(201).json({
        success: true,
        blog: { ...blogDoc, _id: result.insertedId },
      });
    }
  } catch (error) {
    console.error("Error generating blog:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate blog. Please try again." });
  }
});

router.get("/mine", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const blogs = await blogsCollection
      .find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ blogs });
  } catch (error) {
    console.error("Error fetching user blogs:", error);
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

    let user;
    if (ObjectId.isValid(userId)) {
      user = await usersCollection.findOne(
        { $or: [{ _id: new ObjectId(userId) }, { id: userId }] },
        { projection: { role: 1 } }
      );
    } else {
      user = await usersCollection.findOne(
        { id: userId },
        { projection: { role: 1 } }
      );
    }
    const isPro = user?.role === "pro";

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = await blogsCollection.countDocuments({ 
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
    const topic = await generateRandomBlogTopicPrompt();
    res.json({ topic });
  } catch (error) {
    console.error("Error generating random blog topic:", error);
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

    const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });

    if (!blog) {
      res.status(404).json({ error: "Blog not found" });
      return;
    }

    if (blog.visibility === "private") {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(404).json({ error: "Blog not found" });
        return;
      }
      try {
        const { jwtVerify, createRemoteJWKSet } = await import("jose");
        const JWKS = createRemoteJWKSet(
          new URL(`${process.env.CLIENT_URL || "http://localhost:3000"}/api/auth/jwks`)
        );
        const { payload } = await jwtVerify(authHeader.split(" ")[1], JWKS);
        if (payload.sub?.toString() !== blog.ownerId?.toString()) {
          res.status(404).json({ error: "Blog not found" });
          return;
        }
      } catch {
        res.status(404).json({ error: "Blog not found" });
        return;
      }
    }

    res.json({ blog });
  } catch (error) {
    console.error("Error fetching blog:", error);
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

    const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });

    if (!blog) {
      res.status(404).json({ error: "Blog not found" });
      return;
    }

    if (blog.ownerId?.toString() !== userId?.toString()) {
      res.status(403).json({ error: "Forbidden: You can only delete your own blogs" });
      return;
    }

    await blogsCollection.deleteOne({ _id: new ObjectId(id) });

    res.json({ success: true, message: "Blog deleted" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
