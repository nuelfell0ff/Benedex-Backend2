import User from "../models/User.js";
import LearningActivity from "../models/LearningActivity.js";

const badgeRules = [
  { xp: 100, label: "Beginner" },
  { xp: 300, label: "Intermediate" },
  { xp: 600, label: "Advanced" },
  { xp: 1000, label: "Expert" },
];

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const toDateKey = (date) => date.toISOString().slice(0, 10);

const normalizeDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const getIntensity = (count) => {
  if (count >= 5) return 4;
  if (count >= 3) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
};

/**
 * Persists XP to MongoDB atomically.
 * Accepts either a User ID string, a plain user object, or a Mongoose document.
 */
export const applyXpToUser = async (userOrId, points = 0) => {
  const xpGain = Number(points) || 0;
  if (xpGain <= 0) return null;

  // Extract raw ID string cleanly
  const userId = userOrId?._id || userOrId?.id || userOrId;
  if (!userId) return null;

  // 1. Atomically increment XP in the database
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $inc: { xp: xpGain } },
    { new: true, runValidators: false }
  );

  if (!updatedUser) return null;

  // Ensure badges array exists safely
  const currentBadges = Array.isArray(updatedUser.badges) ? updatedUser.badges : [];
  const newBadges = [];

  // 2. Evaluate earned badges
  badgeRules.forEach((rule) => {
    if (updatedUser.xp >= rule.xp && !currentBadges.includes(rule.label)) {
      newBadges.push(rule.label);
    }
  });

  // 3. Atomically add new badges if earned
  if (newBadges.length > 0) {
    return await User.findByIdAndUpdate(
      userId,
      { $addToSet: { badges: { $each: newBadges } } },
      { new: true }
    );
  }

  return updatedUser;
};

export const recordLearningActivity = async ({
  student,
  type,
  title,
  points = 0,
  occurredAt,
}) =>
  LearningActivity.create({
    student,
    type,
    title,
    points: Number(points) || 0,
    isViewed: false,
    createdAt: occurredAt || new Date(),
    updatedAt: occurredAt || new Date(),
  });

export const buildLearningStats = (activities = [], referenceDate = new Date()) => {
  const normalizedActivities = activities
    .map((activity) => ({
      date: normalizeDate(activity.createdAt || activity.occurredAt || activity.updatedAt || referenceDate),
      points: activity.points || 0,
    }))
    .filter((activity) => activity.date instanceof Date && !Number.isNaN(activity.date.valueOf()));

  const byDate = new Map();

  normalizedActivities.forEach((activity) => {
    const key = toDateKey(activity.date);
    const current = byDate.get(key) || 0;
    byDate.set(key, current + 1);
  });

  const sortedKeys = Array.from(byDate.keys()).sort((left, right) => right.localeCompare(left));
  let currentStreak = 0;

  if (sortedKeys.length > 0) {
    let cursor = new Date(`${sortedKeys[0]}T00:00:00.000Z`);

    while (true) {
      const key = toDateKey(cursor);

      if (!byDate.has(key)) {
        break;
      }

      currentStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  const year = referenceDate.getUTCFullYear();
  const months = monthNames.map((name, monthIndex) => {
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

    const days = Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const date = new Date(Date.UTC(year, monthIndex, dayIndex + 1));
      const key = toDateKey(date);
      const count = byDate.get(key) || 0;

      return {
        date: key,
        day: dayIndex + 1,
        count,
        intensity: getIntensity(count),
      };
    });

    return {
      name,
      monthIndex,
      daysInMonth,
      days,
      activeDays: days.filter((day) => day.count > 0).length,
      totalEvents: days.reduce((sum, day) => sum + day.count, 0),
    };
  });

  const totalDays = months.reduce((sum, month) => sum + month.daysInMonth, 0);
  const activeDays = months.reduce((sum, month) => sum + month.activeDays, 0);

  return {
    year,
    currentStreak,
    activeDays,
    totalDays,
    activityCount: normalizedActivities.length,
    months,
  };
};