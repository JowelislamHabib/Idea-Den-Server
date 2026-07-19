

export interface BlueprintInput {
  interests: string;
  timeAvailable: string;
  techStack: string[];
  developerPreferences?: {
    stack?: string[];
    experience?: string;
    focus?: string;
  };
  previousIdeas?: string[];
}

export interface BlueprintOutput {
  projectTitle: string;
  tagline: string;
  theProblem: string;
  targetAudience: string[];
  theSolution: string;
  keyFeatures: {
    name: string;
    description: string;
  }[];
  recommendedTechStack: {
    category: string;
    details: string;
  }[];
  competitors: {
    name: string;
    differentiation: string;
  }[];
  whyBuildThis: {
    title: string;
    description: string;
  }[];
  firstSteps: string[];
  techStack: string[];
  elevatorPitch: string;
  estimatedDuration: string;
}

function buildPrompt(input: BlueprintInput): string {
  const prefs = input.developerPreferences
    ? `\n\nDeveloper preferences:\n- Preferred stack: ${input.developerPreferences.stack?.join(", ") || "Any"}\n- Experience level: ${input.developerPreferences.experience || "Intermediate"}\n- Focus area: ${input.developerPreferences.focus || "Full-stack"}`
    : "";

  const previousIdeasText = input.previousIdeas && input.previousIdeas.length > 0
    ? `\n\nCRITICAL: Do NOT generate an idea similar to any of these previously generated ideas: ${input.previousIdeas.join(", ")}. Provide a completely UNIQUE and NOVEL idea.`
    : "";

  return `You are Idea AI, an expert Product Manager and Ideation Engine. Generate a novel project idea and a Product Requirements Document (PRD) based on the following constraints.

Interests/Industry: ${input.interests}
Time Available: ${input.timeAvailable}
Tech Stack: ${input.techStack.join(", ")}${prefs}${previousIdeasText}

Invent a specific, creative project idea that fits these constraints and generate a JSON PRD with this exact structure:
{
  "projectTitle": "Catchy Project Name",
  "tagline": "The micro-subtitle or 1 sentence description (e.g. The Micro-Equity Platform...)",
  "theProblem": "What is broken in the world today? (1-2 sentences)",
  "targetAudience": ["list of AT LEAST 4 specific user personas"],
  "theSolution": "The narrative hook describing how this project uniquely solves the problem (1-2 paragraphs).",
  "keyFeatures": [
    {
      "name": "Feature Name",
      "description": "Short description of the feature"
    }
  ],
  "recommendedTechStack": [
    {
      "category": "Frontend",
      "details": "Details about the frontend stack"
    }
  ],
  "competitors": [
    {
      "name": "Competitor Name (if any exist, otherwise omit or use 'None')",
      "differentiation": "How is this project different/better"
    }
  ],
  "whyBuildThis": [
    {
      "title": "Portfolio Impact",
      "description": "Explanation of why it's a great project to build"
    }
  ],
  "firstSteps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "elevatorPitch": "A very short 1 sentence pitch for cards",
  "techStack": ["list of just technology names as simple strings"],
  "estimatedDuration": "e.g. 2 weeks"
}

Rules:
- Generate ONLY the JSON object. No markdown, no explanation.
- targetAudience array MUST contain AT LEAST 4 items.
- keyFeatures array MUST contain AT LEAST 4 items.
- competitors array MUST contain AT LEAST 2 items.
- whyBuildThis array MUST contain AT LEAST 2 items.
- Make the content highly engaging and persuasive, like a top-tier Product Manager.`;
}



export async function generateBlueprint(
  input: BlueprintInput
): Promise<BlueprintOutput> {
  try {
    const prompt = buildPrompt(input);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
    
    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API returned ${apiResponse.status}: ${errorText}`);
    }

    const data = await apiResponse.json();
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error("Invalid response format from Gemini API");
    }

    let blueprint: BlueprintOutput;
    try {
      // Sometimes Gemini wraps JSON in markdown blocks even with responseMimeType set
      const cleanedText = textResponse.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      blueprint = JSON.parse(cleanedText) as BlueprintOutput;
    } catch (parseError) {
      import("fs").then(fs => fs.appendFileSync("gemini-parse-error.log", `${new Date().toISOString()} - Raw Response:\n${textResponse}\n`));
      throw new Error("Failed to parse Gemini response as JSON");
    }

    blueprint.projectTitle = blueprint.projectTitle || "New Project Idea";
    blueprint.techStack = blueprint.techStack || input.techStack;
    blueprint.estimatedDuration = blueprint.estimatedDuration || input.timeAvailable;

    return blueprint;
  } catch (error) {
    console.error("Gemini API failed:", error);
    import("fs").then(fs => fs.appendFileSync("gemini-error.log", `${new Date().toISOString()} - ${error instanceof Error ? error.message : String(error)}\n`));
    // Throw a friendly error that the router will catch
    throw new Error("The AI is currently overloaded or unavailable. Please wait a moment and try again.");
  }
}

export async function generateRandomIdeaPrompt(): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
    
    const prompt = `You are an expert brainstorming assistant. Generate exactly one highly creative, realistic, and specific software project idea (e.g., a web app, SaaS, mobile app, or dev tool). Avoid hardware, sci-fi, or highly unrealistic concepts. It should be a 1-sentence phrase suitable for a text input field, such as "A habit tracker with RPG elements" or "A Kanban board for meal planning". DO NOT include any markdown, quotes, or JSON. Just the raw text phrase. KEEP IT UNDER 10 WORDS.`;

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: "text/plain",
          temperature: 0.9,
          maxOutputTokens: 50
        }
      })
    });

    if (!apiResponse.ok) {
      throw new Error(`API returned ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error("Invalid response format from Gemini API");
    }

    return textResponse.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error("Gemini random idea failed:", error);
    throw new Error("Failed to generate random idea");
  }
}

