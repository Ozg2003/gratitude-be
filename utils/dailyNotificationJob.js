// jobs/dailyNotificationJob.js
import cron from "node-cron";
import User from "../models/User.js";
import rawAdmin, { getMessaging } from "./firebaseAdmin.js"; // adapt path if needed
import { sendViaHttpV1 } from "./fcmHttpV1.js";

const admin = (rawAdmin && rawAdmin.default) ? rawAdmin.default : rawAdmin;

const MESSAGES = [
  "Take a moment and note something you're grateful for!",
  "A small reflection today can brighten your whole day 🌟",
  "Your gratitude journal misses you ✨",
  "Pause and reflect — what made you smile today?",
  "Your gratitude streak is growing strong 💪",
  "What's one beautiful thing that happened today?",
  "Don't break the chain! Add to your gratitude streak 📝",
  "Reflect on today's blessings before they fade away",
  "Your future self will thank you for today's entry",
  "Gratitude turns what we have into enough ✨",
  "Capture today's joy before it slips away",
  "Keep your gratitude flame burning 🔥",
  "What made your heart feel light today?",
  "Notice the small things - they matter most🎉",
  "Gratitude is the best attitude to cultivate",
  "Today's memories deserve to be cherished",
  "Don't let today's blessings go unrecorded",
  "Your consistency is building something beautiful",
  "What moment today made you feel alive?",
  "Gratitude makes every day a good day",
  "Keep filling your life with thankful moments",
  "What unexpected joy did you find today?",
  "Your gratitude practice is changing your brain 🧠",
  "Even on tough days, there's always something to appreciate",
  "What made you feel supported today?",
  "Gratitude is the music of the heart 🎵",
  "Don't miss today's chance to count your blessings",
  "What made today different and special?",
  "Your consistency is creating positive patterns",
  "Even small gratitudes create big happiness",
  "What lesson are you grateful for today?",
  "Keep your gratitude momentum going!",
  "What connection are you thankful for today?",
  "Gratitude transforms ordinary days into blessings",
  "Your journal is waiting for today's story",
  "What comfort are you grateful for right now?",
  "Keep adding to your collection of happy moments",
  "What beauty did you notice in the world today?",
  "Gratitude is the heart's memory 💖",
  "Don't let today's magic go unrecorded",
  "What made you feel proud today?",
  "Your daily practice is changing your perspective",
  "Even challenges have hidden blessings",
  "What opportunity are you grateful for?",
  "What simple pleasure brightened your day?",
  "Gratitude makes sense of our past and peace for today",
  "Your consistency is your superpower 🦸",
  "What growth are you thankful for?",
  "Keep weaving gratitude into your daily life",
  "What kindness did you receive or give today?",
  "Gratitude is the sweetest thing in life",
  "Don't miss today's chance to appreciate",
  "What made you feel safe today?",
  "Your practice is making you more resilient",
  "Even ordinary moments hold extraordinary gratitude",
  "What progress are you thankful for?",
  "What made you laugh or smile today?",
  "Gratitude is the healthiest of all emotions",
  "Your dedication is building character",
  "What nature moment are you grateful for?",
  "Keep collecting moments of thankfulness",
  "What knowledge are you thankful for today?",
  "Gratitude makes life richer and deeper",
  "Don't let today's gifts go unnoticed",
  "What strength did you discover today?",
  "Your habit is creating neural pathways of positivity",
  "Even setbacks contain hidden blessings",
  "What freedom are you grateful for?",
  "What comfort are you thankful for?",
  "Gratitude is the memory of the heart",
  "Your persistence is building mental strength",
  "What conversation enriched your day?",
  "Keep building your gratitude reservoir",
  "What technology are you grateful for?",
  "Gratitude turns denial into acceptance",
  "Don't skip today's opportunity to reflect",
  "What accomplishment made you proud?",
  "Your practice is rewiring your brain for happiness",
  "Even difficult people teach us valuable lessons",
  "What beauty in others are you thankful for?",
  "What sensory experience delighted you today?",
  "Gratitude is the sign of noble souls",
  "Your dedication is creating lasting change",
  "What memory are you grateful to have?",
  "Keep adding to your gratitude treasure chest",
  "What modern convenience are you thankful for?",
  "Gratitude makes us feel abundant",
  "Don't let today's wonders go unappreciated",
  "What skill are you grateful to possess?",
  "Your habit is making you more mindful",
  "Even waiting teaches us patience",
  "What artistic expression moved you today?",
  "What food or drink are you thankful for?",
  "Gratitude is the wine for the soul",
  "Your persistence is creating positive energy",
  "What book or media inspired you today?",
  "Keep building your gratitude foundation",
  "What home comfort are you grateful for?",
  "Gratitude turns what we have into abundance",
  "Don't miss today's chance to be thankful",
  "What health blessing are you thankful for?",
  "Your consistency is building emotional resilience",
  "Even traffic jams give us time to think",
  "What cultural experience enriched you?",
  "What childhood memory are you grateful for?",
  "Gratitude is the fairest blossom",
  "Your dedication is making you more compassionate",
  "What seasonal change are you appreciating?",
  "Keep collecting gratitude like precious gems",
  "What scientific advancement are you thankful for?",
  "Gratitude makes difficult times bearable",
  "Don't let today's learning go unrecorded",
  "What relationship are you grateful for?",
  "Your practice is enhancing your relationships",
  "Even mistakes lead to growth",
  "What musical moment touched you today?",
  "What personal quality are you thankful for?",
  "Gratitude is the heart's way of smiling",
  "Your persistence is creating neural happiness pathways",
  "What travel experience are you grateful for?",
  "Keep building your gratitude portfolio",
  "What educational opportunity are you thankful for?",
  "Gratitude turns meals into feasts",
  "Don't skip today's moment of appreciation",
  "What financial blessing are you grateful for?",
  "Your consistency is making you more optimistic",
  "Even bad weather brings necessary rain",
  "What spiritual moment moved you today?",
  "What family memory are you thankful for?",
  "Gratitude is the music of a happy heart",
  "Your dedication is building emotional wealth",
  "What creative expression are you grateful for?",
  "Keep adding to your gratitude collection",
  "What medical advancement are you thankful for?",
  "Gratitude makes houses into homes",
  "Don't let today's inspiration fade away",
  "What friendship are you grateful for?",
  "Your practice is making you more resilient",
  "Even endings make room for new beginnings",
  "What childhood friend are you thankful for?",
  "What teacher or mentor impacted you?",
  "Gratitude is the sweetest thing in a seeker's life",
  "Your persistence is creating positive habits",
  "What historical event are you grateful for?",
  "Keep building your gratitude muscle",
  "What invention are you thankful exists?",
  "Gratitude turns problems into opportunities",
  "Don't miss today's chance to count blessings",
  "What personal growth are you grateful for?",
  "Your consistency is building mental fortitude",
  "Even silence teaches us to listen",
  "What cultural tradition are you thankful for?",
  "What animal companion are you grateful for?",
  "Gratitude is the heart's memory of goodness",
  "Your dedication is making you more present",
  "What holiday memory are you thankful for?",
  "Keep collecting moments of appreciation",
  "What scientific discovery are you grateful for?",
  "Gratitude makes the soul great",
  "Don't let today's beauty go unnoticed",
  "What personal achievement are you proud of?",
  "Your practice is enhancing your well-being",
  "Even obstacles make us stronger",
  "What artistic creation are you thankful for?",
  "What family member are you grateful for?",
  "Gratitude is the wine of the heart",
  "Your persistence is creating lasting happiness",
  "What childhood experience shaped you positively?",
  "Keep building your gratitude legacy",
  "What modern medicine are you thankful for?",
  "Gratitude turns enough into more",
  "Don't skip today's moment of thankfulness",
  "What personal freedom are you grateful for?",
  "Your consistency is making you more empathetic",
  "Even clouds make us appreciate the sun",
  "What cultural diversity enriches your life?",
  "What mentor changed your life for better?",
  "Gratitude is the memory of happiness",
  "Your dedication is building emotional intelligence",
  "What seasonal beauty are you appreciating?",
  "Keep adding to your gratitude bank",
  "What technological convenience helps you?",
  "Gratitude makes ordinary moments extraordinary",
  "Don't let today's learning opportunity pass",
  "What relationship taught you valuable lessons?",
  "Your practice is making you more grateful naturally",
  "Even difficult times build character",
  "What musical artist are you thankful for?",
  "What personal strength are you proud of?",
  "Gratitude is the heart's way of celebrating life",
  "Your persistence is creating positive change",
  "What travel memory are you grateful for?",
  "Keep building your gratitude foundation strong",
  "What educational resource are you thankful for?",
  "Gratitude turns waiting into patience",
  "Don't miss today's chance to appreciate life",
  "What financial stability are you grateful for?",
  "Your consistency is building emotional resilience",
  "Even storms bring necessary cleansing rain",
  "What spiritual practice comforts you?",
  "What family tradition are you grateful for?",
  "Gratitude is the sweetest attitude",
  "Your dedication is making every day brighter",
  "What creative talent are you thankful for?",
  "Keep collecting gratitude moments daily",
  "What medical care are you grateful for?",
  "Gratitude makes challenges into opportunities",
  "Don't let today's blessings go unacknowledged",
  "What friendship has stood the test of time?",
  "Your practice is making gratitude your default",
  "Even endings make beginnings possible",
  "What childhood memory makes you smile?",
  "What teacher inspired you to grow?",
  "Gratitude is the heart's favorite language",
  "Your persistence is creating neural pathways of joy",
  "What historical figure inspires you?",
  "Keep building your gratitude practice strong",
  "What invention makes your life easier?",
  "Gratitude turns problems into lessons",
  "Don't skip today's moment of reflection",
  "What personal transformation are you proud of?",
  "Your consistency is making you more mindful",
  "Even quiet moments bring peace",
  "What cultural experience expanded your view?",
  "What pet or animal brings you joy?",
  "Gratitude is the memory of love",
  "Your dedication is building lasting happiness",
  "What holiday brings your family together?",
  "Keep adding to your gratitude collection daily",
  "What scientific fact amazes you?",
  "Gratitude makes the soul sing",
  "Don't let today's gifts go unappreciated",
  "What personal milestone are you proud of?",
  "Your practice is making you more positive naturally",
  "Even difficulties make successes sweeter",
  "What artwork has touched your soul?",
  "What family bond are you thankful for?",
  "Gratitude is the wine that intoxicates the soul",
  "Your persistence is creating emotional abundance",
  "What childhood lesson serves you well?",
  "Keep building your gratitude muscle strong",
  "What medical breakthrough gives you hope?",
  "Gratitude turns ordinary days into blessings",
  "Your consistency is creating a beautiful life story"
];


const BATCH_SIZE = 500;

const sendWithAdminMulticast = async (messaging, tokens, title, body) => {
  return await messaging.sendMulticast({
    tokens,
    notification: { title, body },
  });
};

const processAdminResponseAndCleanup = async (response, batch) => {
  const invalidTokens = [];
  if (!response) return;

  if (Array.isArray(response.responses)) {
    response.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token" ||
            (r.error?.message || "").toLowerCase().includes("not registered")) {
          invalidTokens.push(batch[idx]);
        }
      }
    });
  } else if (Array.isArray(response.results)) {
    response.results.forEach((r, idx) => {
      if (r.error && ((r.error.message || "").toLowerCase().includes("not registered") || (r.error.code || "").includes("invalid"))) {
        invalidTokens.push(batch[idx]);
      }
    });
  }

  if (invalidTokens.length) {
    await User.updateMany({}, { $pull: { fcmToken: { $in: invalidTokens } } });
    console.log(`Removed ${invalidTokens.length} invalid tokens`);
  }
};

const processHttpV1ResultsAndCleanup = async (results) => {
  // results = [{ token, status, ok, data }]
  const invalid = [];
  for (const r of results) {
    // FCM HTTP v1 sends back 200 with name on success.
    // On error it returns an object with error.message or a non-2xx status.
    if (!r.ok) {
      const msg = JSON.stringify(r.data || {});
      if (msg.toLowerCase().includes("not_registered") || msg.toLowerCase().includes("not registered") || msg.toLowerCase().includes("invalid")) {
        invalid.push(r.token);
      }
    }
  }
  if (invalid.length) {
    await User.updateMany({}, { $pull: { fcmToken: { $in: invalid } } });
    console.log(`Removed ${invalid.length} invalid tokens (HTTP v1)`);
  }
};

/**
 * Runs the daily notification job once.
 * Exported so you can call it from a trigger endpoint (POST /tasks/run-daily) or from the cron scheduler below.
 */
export const runDailyJobOnce = async () => {
  try {
    console.log("⏰ Running daily gratitude notification job (runDailyJobOnce)...");

    const users = await User.find({ fcmToken: { $ne: null } }).lean();
    if (!users || users.length === 0) {
      console.log("❌ No users with tokens. Skipping send.");
      return { sent: 0 };
    }

    // Support cases where fcmToken is a string or an array on the user document.
    const tokensRaw = users.flatMap((u) => {
      if (!u.fcmToken) return [];
      if (Array.isArray(u.fcmToken)) return u.fcmToken;
      return [u.fcmToken];
    });

    // Dedupe and filter falsy
    const tokens = [...new Set(tokensRaw.filter(Boolean))];

    if (tokens.length === 0) {
      console.log("❌ No valid tokens after filtering. Skipping.");
      return { sent: 0 };
    }

    const randomMessage = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    const title = "Daily Gratitude Reminder";
    const body = randomMessage;

    // If admin.messaging has a high-level send, use it; otherwise use HTTP v1
    const messagingAvailable = admin && typeof admin.messaging === "function";
    const messaging = messagingAvailable ? admin.messaging() : null;
    const hasMulticast = messaging && typeof messaging.sendMulticast === "function";
    const hasSendAll = messaging && typeof messaging.sendAll === "function";

    let totalSent = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);

      if (hasMulticast) {
        try {
          const response = await sendWithAdminMulticast(messaging, batch, title, body);
          await processAdminResponseAndCleanup(response, batch);
          // estimate sent count: successful responses in response.responses
          if (Array.isArray(response.responses)) {
            const succ = response.responses.filter(r => r.success).length;
            totalSent += succ;
          } else if (Array.isArray(response.results)) {
            const succ = response.results.filter(r => !r.error).length;
            totalSent += succ;
          } else {
            // fallback: assume whole batch attempted
            totalSent += batch.length;
          }
          console.log(`Admin sendMulticast batch processed: ${batch.length} tokens`);
        } catch (err) {
          console.error("Error sending multicast batch via admin SDK:", err);
        }
      } else {
        // fallback: HTTP v1
        try {
          console.log("Using HTTP v1 fallback to send messages for this batch");
          const results = await sendViaHttpV1(batch, title, body);
          await processHttpV1ResultsAndCleanup(results);
          const succ = results.filter(r => r.ok).length;
          totalSent += succ;
          console.log(`HTTP v1 batch processed: ${batch.length} tokens, ${succ} succeeded`);
        } catch (err) {
          console.error("Error sending batch via HTTP v1 fallback:", err);
        }
      }
    }

    console.log(`📨 Daily notifications job completed. Approx sent: ${totalSent}`);
    return { sent: totalSent };
  } catch (err) {
    console.error("❌ Error in runDailyJobOnce:", err);
    throw err;
  }
};

/**
 * Keeps existing cron scheduler for backwards compatibility.
 * If you prefer to rely on an external trigger, you can stop calling startDailyJob().
 */
export const startDailyJob = () => {
  if (global._dailyGratitudeJobStarted) {
    console.log("⏰ Daily notification scheduler already started (skipping duplicate start)");
    return;
  }
  global._dailyGratitudeJobStarted = true;

  // Runs every day at the configured cron time (server timezone by default)
  // NOTE: Update this cron expression or add timezone option if you need a specific tz.
  cron.schedule("35 12 * * *", async () => {
    try {
      await runDailyJobOnce();
    } catch (err) {
      console.error("❌ Error while running cron-driven daily job:", err);
    }
  });

  console.log("⏰ startDailyJob scheduled (cron active).");
};

export default {
  startDailyJob,
  runDailyJobOnce
};
