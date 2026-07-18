import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { blogsCollection } from "../config/db";
import { generateBlog, type BlogInput } from "../services/gemini-blog";

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

    const filter: Record<string, unknown> = {};

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

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { topic, template, tone, length, keywords, additionalInstructions, regenerateId, userId, userName, userEmail } = req.body;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
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
    try {
      const { usersCollection } = await import("../config/db");
      let user;
      if (ObjectId.isValid(userId)) {
        user = await usersCollection.findOne({
          $or: [{ _id: new ObjectId(userId) }, { id: userId }],
        });
      } else {
        user = await usersCollection.findOne({ id: userId });
      }
      if (user) userRole = user.role || "free";
    } catch (err) {
      console.error("Error fetching user for quota check:", err);
    }

    if (userRole !== "pro") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayCount = await blogsCollection.countDocuments({
        ownerId: userId.toString(),
        createdAt: { $gte: startOfDay }
      });

      // Same 3 limits for free users
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (regenerateId && ObjectId.isValid(regenerateId)) {
      // Overwrite existing blog if regenerating
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

router.get("/mine", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
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

router.get("/quota", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    let isPro = false;
    try {
      const { usersCollection } = await import("../config/db");
      const { ObjectId } = await import("mongodb");
      let user;
      if (ObjectId.isValid(userId)) {
        user = await usersCollection.findOne({
          $or: [{ _id: new ObjectId(userId) }, { id: userId }],
        });
      } else {
        user = await usersCollection.findOne({ id: userId });
      }
      if (user?.role === "pro") {
        isPro = true;
      }
    } catch (err) {
      console.error("Error fetching user for quota:", err);
    }

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

    res.json({ blog });
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { userId } = req.body;

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
