// controllers/summaryController.js
import Summary from "../models/Summary.js";
import Entry from "../models/Entry.js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Helper to compute UTC month start/end
 */
function monthBoundsUTC(month) {
  // month is "YYYY-MM"
  const start = new Date(`${month}-01T00:00:00.000Z`); // UTC start of month
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1); // move to first of next month
  const end = new Date(next.getTime() - 1); // last ms of requested month
  return { start, end };
}

/**
 * POST /api/summary/generate
 */
export const generateSummary = async (req, res) => {
  try {
    const { deviceId, month } = req.body;
    if (!deviceId || !month) {
      return res.status(400).json({ error: "deviceId and month are required" });
    }

    // validate month format
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({ error: "Month must be in YYYY-MM format" });
    }

    const { start, end } = monthBoundsUTC(month);

    // Support both Date-object entries and legacy "YYYY-MM-DD" string entries.
    const dateRangeQuery = { date: { $gte: start, $lte: end } };
    const stringMonthRegexQuery = { date: { $type: "string", $regex: `^${month}` } };

    // Count documents that match either condition
    const entriesCount = await Entry.countDocuments({
      deviceId,
      $or: [dateRangeQuery, stringMonthRegexQuery],
    });

    if (entriesCount === 0) {
      return res.status(404).json({ error: "No entries found for this month", entriesCount });
    }

    // fetch entries (single declaration; we'll normalize and sort in JS below)
    let entries = await Entry.find({
      deviceId,
      $or: [dateRangeQuery, stringMonthRegexQuery],
    }).lean();

    // Normalize dates to dateObj (Date instance) for sorting and drop unparseable ones
    entries = entries
      .map((e) => {
        // pick updatedAt if available for ordering relevance; still produce dateObj for sorting
        let dateObj = null;
        if (e.date instanceof Date) {
          dateObj = e.date;
        } else if (typeof e.date === "string") {
          const tmp = new Date(e.date);
          dateObj = isNaN(tmp.getTime()) ? null : tmp;
        }
        // also attach updatedAt if present (could be undefined)
        const updatedAt = e.updatedAt ? new Date(e.updatedAt) : null;
        return { ...e, dateObj, updatedAt };
      })
      .filter((e) => e.dateObj !== null); // drop entries with unparseable dates

    // Sort by normalized date ascending (fallback to updatedAt if date ties)
    entries.sort((a, b) => {
      const diff = a.dateObj - b.dateObj;
      if (diff !== 0) return diff;
      const au = a.updatedAt ? a.updatedAt.getTime() : 0;
      const bu = b.updatedAt ? b.updatedAt.getTime() : 0;
      return au - bu;
    });

    // fetch existing summary doc (if any)
    const summaryDoc = await Summary.findOne({ deviceId, month });
    const prevCount = summaryDoc ? Number(summaryDoc.entriesCountAtLastGenerate || 0) : 0;

    // Find the newest entry timestamp for that month (prefer updatedAt, fallback to date)
    // We try to avoid an extra DB query by using the normalized `entries` above if possible.
    let latestEntryAt = null;
    if (entries.length > 0) {
      // find the max of updatedAt or dateObj
      latestEntryAt = entries.reduce((max, e) => {
        const cand = e.updatedAt || e.dateObj;
        if (!cand) return max;
        if (!max) return cand;
        return new Date(cand) > new Date(max) ? cand : max;
      }, null);
    } else {
      // as a fallback (shouldn't usually happen because entriesCount > 0), query DB
      const latestEntry = await Entry.findOne({
        deviceId,
        $or: [dateRangeQuery, stringMonthRegexQuery],
      })
        .sort({ updatedAt: -1, date: -1 })
        .select("updatedAt date")
        .lean();
      latestEntryAt = latestEntry ? (latestEntry.updatedAt || latestEntry.date) : null;
    }

    // Decide whether regeneration is needed.
    // Regenerate if:
    //  - no previous summary, or
    //  - count changed, or
    //  - newest entry timestamp is newer than generatedAt (account for missing generatedAt)
    const generatedAt = summaryDoc ? (summaryDoc.generatedAt || summaryDoc.createdAt) : null;

    const needsRegeneration =
      !summaryDoc ||
      Number(entriesCount) !== Number(prevCount) ||
      (latestEntryAt && (!generatedAt || new Date(latestEntryAt) > new Date(generatedAt)));

    if (!needsRegeneration) {
      return res.status(400).json({
        error: "No new entries since last generated summary",
        needsRegeneration: false,
        entriesCount,
        entriesCountAtLastGenerate: prevCount,
        summary: summaryDoc ? summaryDoc.summaryText : null,
      });
    }

    // Prepare text data (change `text` to `content` or the real field if different)
    const textData = entries
      .filter((e) => e.text && e.text.trim() !== "")
      .map((e) => `- ${e.text.trim()}`)
      .join("\n");

    if (!textData) {
      return res
        .status(400)
        .json({ error: "No text content found for summary", entriesCount });
    }

    // Compose prompt
    const prompt = `
      Create a warm, reflective monthly gratitude summary based on these journal entries. 
      The summary should be uplifting, personal, and highlight recurring themes or special moments.
      Write it in first person as if the person is reflecting on their month.
      Keep it short: one paragraph.
      
      Journal Entries:
      ${textData}
    `;

    // Call OpenAI (ensure your model & input shape are supported)
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      // optionally set max tokens or other params here
    });

    // response parsing may vary by SDK version; adjust if needed
    const summaryText =
      response?.output?.[0]?.content?.[0]?.text?.trim() || (response.output_text || "").trim();

    if (!summaryText) {
      return res.status(500).json({ error: "Failed to parse generated summary" });
    }

    // Save or update summary with entriesCountAtLastGenerate and generatedAt
    const upsert = {
      summaryText,
      entriesCountAtLastGenerate: entriesCount,
      generatedAt: new Date(),
    };

    const updated = await Summary.findOneAndUpdate(
      { deviceId, month },
      upsert,
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      summary: updated.summaryText,
      month: updated.month,
      needsRegeneration: false,
      entriesCount,
      entriesCountAtLastGenerate: updated.entriesCountAtLastGenerate,
      generatedAt: updated.generatedAt,
    });
  } catch (error) {
    console.error("Summary generation error:", error);
    // handle unique constraint or other DB-specific errors as needed
    res.status(500).json({
      error: "Failed to generate summary",
      details: error.message,
    });
  }
};

/**
 * GET /api/summary/:deviceId/:month
 */
export const getSummary = async (req, res) => {
  try {
    const { deviceId, month } = req.params;
    if (!deviceId || !month) {
      return res.status(400).json({ error: "deviceId and month are required" });
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({ error: "Month must be in YYYY-MM format" });
    }

    const { start, end } = monthBoundsUTC(month);

    const dateRangeQuery = { date: { $gte: start, $lte: end } };
    const stringMonthRegexQuery = { date: { $type: "string", $regex: `^${month}` } };

    // entries count (supports both date types)
    const entriesCount = await Entry.countDocuments({
      deviceId,
      $or: [dateRangeQuery, stringMonthRegexQuery],
    });

    const summaryDoc = await Summary.findOne({ deviceId, month });

    // newest entry timestamp for the month (prefer updatedAt, fallback to date)
    const latestEntry = await Entry.findOne({
      deviceId,
      $or: [dateRangeQuery, stringMonthRegexQuery],
    })
      .sort({ updatedAt: -1, date: -1 })
      .select("updatedAt date")
      .lean();

    const latestEntryAt = latestEntry ? (latestEntry.updatedAt || latestEntry.date) : null;
    const generatedAt = summaryDoc ? (summaryDoc.generatedAt || summaryDoc.createdAt) : null;

    const needsRegeneration =
      !summaryDoc ||
      Number(entriesCount) !== Number(summaryDoc.entriesCountAtLastGenerate || 0) ||
      (latestEntryAt && (!generatedAt || new Date(latestEntryAt) > new Date(generatedAt)));

    if (!summaryDoc) {
      return res.status(200).json({
        success: true,
        summary: null,
        hasSummary: false,
        needsRegeneration,
        entriesCount,
        entriesCountAtLastGenerate: 0,
        generatedAt: null,
      });
    }

    return res.status(200).json({
      success: true,
      summary: summaryDoc.summaryText,
      hasSummary: true,
      needsRegeneration,
      entriesCount,
      entriesCountAtLastGenerate: summaryDoc.entriesCountAtLastGenerate || 0,
      generatedAt: summaryDoc.generatedAt || summaryDoc.createdAt,
    });
  } catch (error) {
    console.error("Get summary error:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
};

/**
 * GET /api/summary/months/:deviceId
 * Returns months that have entries + months that have summaries.
 */
export const getAvailableMonths = async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId) {
      return res.status(400).json({ error: "deviceId is required" });
    }

    // Distinct month strings from entry dates (works for Date fields; string-dates won't be included here)
    const monthsAgg = await Entry.aggregate([
      { $match: { deviceId } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$date" },
          },
        },
      },
      { $sort: { "_id": -1 } },
    ]);

    const uniqueMonths = monthsAgg.map((m) => m._id);

    const summaries = await Summary.find({ deviceId }).select("month -_id");
    const monthsWithSummaries = summaries.map((s) => s.month);

    return res.json({
      success: true,
      availableMonths: uniqueMonths,
      monthsWithSummaries,
    });
  } catch (error) {
    console.error("Get available months error:", error);
    res.status(500).json({ error: "Failed to fetch available months" });
  }
};
