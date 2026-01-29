import Summary from "../models/Summary.js";
import Entry from "../models/Entry.js";
// import OpenAI from "openai";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ---------------------------------------
   Helpers
----------------------------------------*/
function monthBoundsUTC(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = new Date(next.getTime() - 1);
  return { start, end };
}

/* ---------------------------------------
   POST /api/summary/generate
   Always generates a FRESH summary
----------------------------------------*/
export const generateSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { month } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Month must be in YYYY-MM format" });
    }

    const { start, end } = monthBoundsUTC(month);

    // 🔹 Source of truth: entries ONLY
    const entries = await Entry.find({
      user: userId,
      createdAt: { $gte: start, $lte: end },
    }).lean();

    if (!entries.length) {
      await Summary.deleteOne({ user: userId, month });
      return res.status(404).json({ error: "No entries found for this month" });
    }

    const textEntries = entries
      .filter(e => e.text && e.text.trim())
      .map(e => `- ${e.text.trim()}`);

    if (!textEntries.length) {
      await Summary.deleteOne({ user: userId, month });
      return res.status(400).json({ error: "No text content found" });
    }

    const entryCount = textEntries.length;

    // 🔥 HARD RESET — guarantees no old summary influence
    await Summary.deleteOne({ user: userId, month });

    /* ===================== PROMPT ===================== */
    const prompt = `
You are generating a BRAND NEW monthly gratitude summary.

CRITICAL RULES:
- Ignore any previously generated summaries.
- Do NOT continue or reference past summaries.
- Base the summary ONLY on the journal entries below.

LANGUAGE RULES:
- Detect the primary language/script used by the user.
- If entries are mixed, use the majority language.
- If the user writes in Latin-script mixed language (e.g. Hinglish like "aaj me thankful hu"),
  KEEP the same script and style.
- Do NOT transliterate unless the user already did.

WRITING STYLE:
- First person
- Warm, reflective, uplifting
- Personal and natural
- No bullet points
- Do not quote entries verbatim

LENGTH RULES (STRICT):
- More than 8 entries → 1 short paragraph
- 3–8 entries → ~4–5 lines
- 1–2 entries → 1–2 lines

Journal entries (count: ${entryCount}):
${textEntries.join("\n")}

Output ONLY the summary text.
`;
    /* ================================================= */

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const result = await model.generateContent(prompt);

const summaryText = result?.response?.text()?.trim();


    if (!summaryText) {
      return res.status(500).json({ error: "Failed to generate summary" });
    }

    const saved = await Summary.create({
      user: userId,
      month,
      summary: summaryText,
      entriesCountAtLastGenerate: entryCount,
      generatedAt: new Date(), 
    });

    return res.json({
      success: true,
      summary: saved.summary,
      needsRegeneration: false,
      entriesCount: entryCount,
      generatedAt: saved.generatedAt,
    });
  } catch (err) {
    console.error("Summary generation error:", err);
    res.status(500).json({ error: "Failed to generate summary" });
  }
};
 
/* ---------------------------------------
   GET /api/summary/:month
----------------------------------------*/
export const getSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { month } = req.params;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Invalid month format" });
    }

    const { start, end } = monthBoundsUTC(month);

    const entriesCount = await Entry.countDocuments({
      user: userId,
      createdAt: { $gte: start, $lte: end },
    });

    const summaryDoc = await Summary.findOne({ user: userId, month });

    const needsRegeneration =
      entriesCount > 0 &&
      (!summaryDoc ||
        summaryDoc.entriesCountAtLastGenerate !== entriesCount);

    return res.json({
      success: true,
      summary: summaryDoc?.summary || null,
      hasSummary: Boolean(summaryDoc),
      needsRegeneration,
      entriesCount,
      entriesCountAtLastGenerate:
        summaryDoc?.entriesCountAtLastGenerate || 0,
      generatedAt: summaryDoc?.generatedAt || null,
    });
  } catch (err) {
    console.error("Get summary error:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
};
