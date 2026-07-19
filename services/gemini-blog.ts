export interface BlogInput {
  topic: string;
  template: string; // e.g., "Listicle", "How-To Guide", "Thought Leadership"
  tone: string; // e.g., "Professional", "Casual", "Humorous"
  length: string; // e.g., "Short", "Medium", "Long"
  keywords: string[];
  additionalInstructions?: string;
  previousBlogs?: string[]; // for regeneration to avoid duplicates
}

export interface BlogOutput {
  title: string;
  seoMetaDescription: string;
  content: string; // Markdown formatted
}

function buildPrompt(input: BlogInput): string {
  const keywordsText = input.keywords.length > 0 
    ? `\nKeywords to include: ${input.keywords.join(", ")}` 
    : "";
  
  const additionalText = input.additionalInstructions 
    ? `\nAdditional Instructions: ${input.additionalInstructions}` 
    : "";

  let lengthConstraint = "";
  if (input.length === "Short") lengthConstraint = "roughly 300-500 words";
  if (input.length === "Medium") lengthConstraint = "roughly 800-1200 words";
  if (input.length === "Long") lengthConstraint = "roughly 1500-2000 words";

  const previousBlogsText = input.previousBlogs && input.previousBlogs.length > 0
    ? `\n\nCRITICAL: The user has regenerated this blog. Do NOT generate the same content as before. Provide a fresh take on the topic.`
    : "";

  return `You are Idea AI, an expert AI Copywriter and Content Strategist. Generate a high-quality blog article based on the following constraints.

Topic: ${input.topic}
Format/Template: ${input.template}
Tone of Voice: ${input.tone}
Target Length: ${lengthConstraint}${keywordsText}${additionalText}${previousBlogsText}

Generate a JSON object representing the blog post with this exact structure:
{
  "title": "Catchy, SEO-optimized title",
  "seoMetaDescription": "A compelling meta description (150-160 characters)",
  "content": "The full blog content formatted in rich Markdown. Use proper headings (#, ##, ###), bullet points, bold text for emphasis, and engaging formatting. The content should be extremely high-quality, engaging, and match the specified tone."
}

Rules:
- Generate ONLY the JSON object. No markdown wrapping the JSON, no explanation.
- The 'content' field MUST contain Markdown formatting.
- CRITICAL: You MUST use double line breaks (\\n\\n) to separate paragraphs. Do not use single line breaks.
- CRITICAL: Do NOT include the main title as an H1 (# ) at the beginning of the content. The title is displayed separately. Start directly with the introduction or an H2 (##).
- Ensure the article feels human-written, engaging, and highly readable.
- If keywords are provided, seamlessly integrate them into the content.`;
}

export async function generateBlog(
  input: BlogInput
): Promise<BlogOutput> {
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
          temperature: 0.8, // Slightly higher temp for creative writing
          maxOutputTokens: 4096 // Blogs need more tokens
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

    let blog: BlogOutput;
    try {
      const cleanedText = textResponse.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      blog = JSON.parse(cleanedText) as BlogOutput;
    } catch (parseError) {
      import("fs").then(fs => fs.appendFileSync("gemini-blog-parse-error.log", `${new Date().toISOString()} - Raw Response:\n${textResponse}\n`));
      throw new Error("Failed to parse Gemini response as JSON");
    }

    blog.title = blog.title || "Untitled Blog Post";

    return blog;
  } catch (error) {
    console.error("Gemini Blog API failed:", error);
    import("fs").then(fs => fs.appendFileSync("gemini-blog-error.log", `${new Date().toISOString()} - ${error instanceof Error ? error.message : String(error)}\n`));
    throw new Error("The AI is currently overloaded or unavailable. Please wait a moment and try again.");
  }
}

export async function generateRandomBlogTopicPrompt(): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
    
    const prompt = `You are an expert content strategist. Generate exactly one highly engaging and specific blog post topic. It should be a 1-sentence phrase suitable for a text input field, such as "The future of AI in frontend development" or "10 ways to optimize your React app's performance". DO NOT include any markdown, quotes, or JSON. Just the raw text phrase. KEEP IT UNDER 12 WORDS.`;

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
    console.error("Gemini random blog topic failed:", error);
    throw new Error("Failed to generate random blog topic");
  }
}

