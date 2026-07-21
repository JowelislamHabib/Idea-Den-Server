import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { usersCollection } from "../config/db";
import { verifyToken } from "../middleware/verifyToken";

const router = Router();

router.get("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let user;

    if (ObjectId.isValid(userId)) {
      user = await usersCollection.findOne({
        $or: [{ _id: new ObjectId(userId) }, { id: userId }],
      });
    } else {
      user = await usersCollection.findOne({ id: userId });
    }

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { password: _, ...profile } = user as Record<string, unknown>;

    res.json({ user: profile });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const { name, developerPreferences } = req.body;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const updateFields: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        res.status(400).json({ error: "Name must be at least 2 characters" });
        return;
      }
      updateFields.name = name.trim();
    }

    if (developerPreferences !== undefined) {
      if (typeof developerPreferences !== "object") {
        res.status(400).json({ error: "Invalid developer preferences" });
        return;
      }

      const allowedFields = ["stack", "experience", "focus"];
      const sanitizedPrefs: Record<string, unknown> = {};

      for (const key of allowedFields) {
        if (developerPreferences[key] !== undefined) {
          if (Array.isArray(developerPreferences[key])) {
            sanitizedPrefs[key] = developerPreferences[key]
              .filter((v: unknown) => typeof v === "string")
              .slice(0, 20);
          } else if (typeof developerPreferences[key] === "string") {
            sanitizedPrefs[key] = developerPreferences[key].trim().slice(0, 100);
          }
        }
      }

      updateFields.developerPreferences = sanitizedPrefs;
    }

    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    updateFields.updatedAt = new Date();

    let result;

    if (ObjectId.isValid(userId)) {
      result = await usersCollection.findOneAndUpdate(
        {
          $or: [{ _id: new ObjectId(userId) }, { id: userId }],
        },
        { $set: updateFields },
        { returnDocument: "after" }
      );
    } else {
      result = await usersCollection.findOneAndUpdate(
        { id: userId },
        { $set: updateFields },
        { returnDocument: "after" }
      );
    }

    if (!result) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { password: _pwd, ...profile } = result as Record<string, unknown>;

    res.json({ user: profile });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/upgrade", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const { sessionId, subscriptionId, customerId } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: "Missing sessionId" });
      return;
    }

    const query = ObjectId.isValid(userId)
      ? { $or: [{ _id: new ObjectId(userId) }, { id: userId }] }
      : { id: userId };

    await usersCollection.updateOne(query, {
      $set: {
        role: "pro",
        stripeCustomerId: customerId || null,
        stripeSubscriptionId: subscriptionId || null,
        subscriptionStatus: "active",
        currentPeriodEnd: null,
        upgradedAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error upgrading user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
