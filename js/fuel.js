// ── Pulse Fuel — business logic ────────────────────────────
//
// Hand portions are the unit of account (no barcode database):
//   palm   ~25g protein   (a palm of meat/fish/tofu/legumes)
//   fist   ~1 cup vegetables (quality/fiber anchor, no macro calories)
//   cupped ~15g carbs     (a cupped handful of rice/potato/fruit/bread)
//   thumb  ~10g fat       (a thumb of nuts/oils/cheese/avocado)
//
// Everything here is an estimate — close enough to steer behavior, never
// presented as clinical precision. Pure functions; unit-tested.

export const PORTION_MACROS = Object.freeze({
  proteinPerPalm: 25,
  carbsPerCupped: 15,
  fatPerThumb: 10,
  caloriesPerProtein: 4,
  caloriesPerCarb: 4,
  caloriesPerFat: 9,
});

export const PORTION_KEYS = Object.freeze(['palms', 'fists', 'cupped', 'thumbs']);

export const PORTION_EXAMPLES = Object.freeze({
  palms: 'meat, fish, eggs, tofu, beans',
  fists: 'vegetables and fruit',
  cupped: 'rice, oats, potatoes, bread',
  thumbs: 'oil, nuts, seeds, avocado',
});

export const PORTION_LABELS = Object.freeze({
  palms: ['palm', 'palms'],
  fists: ['fist', 'fists'],
  cupped: ['cupped', 'cupped'],
  thumbs: ['thumb', 'thumbs'],
});

// Embedded meal templates: a starting point, not a prescription. Each one
// pre-fills the normal hand-portion modal, so the user can adjust before saving.
export const MEAL_TEMPLATES = Object.freeze([
  {
    id: 'eggs-toast',
    name: 'Eggs & toast',
    portions: { palms: 2, fists: 0, cupped: 2, thumbs: 1 },
    wholeFood: true,
    note: 'Eggs, wholegrain toast, butter or oil',
  },
  {
    id: 'chicken-rice-bowl',
    name: 'Chicken rice bowl',
    portions: { palms: 2, fists: 2, cupped: 1, thumbs: 1 },
    wholeFood: true,
    note: 'Chicken, rice, mixed veg, olive oil',
  },
  {
    id: 'salmon-potato',
    name: 'Salmon & potatoes',
    portions: { palms: 2, fists: 2, cupped: 1, thumbs: 1 },
    wholeFood: true,
    note: 'Salmon, potatoes, greens',
  },
  {
    id: 'yoghurt-berries',
    name: 'Yoghurt & berries',
    portions: { palms: 1, fists: 1, cupped: 1, thumbs: 0 },
    wholeFood: true,
    note: 'Greek yoghurt, berries, oats',
  },
  {
    id: 'tofu-stirfry',
    name: 'Tofu stir-fry',
    portions: { palms: 2, fists: 2, cupped: 1, thumbs: 1 },
    wholeFood: true,
    note: 'Tofu, mixed veg, rice, sesame oil',
  },
  {
    id: 'beans-toast',
    name: 'Beans on toast',
    portions: { palms: 1, fists: 2, cupped: 2, thumbs: 1 },
    wholeFood: true,
    note: 'Beans, wholegrain toast, olive oil',
  },
  {
    id: 'oats-peanut-butter',
    name: 'Oats & peanut butter',
    portions: { palms: 1, fists: 0, cupped: 2, thumbs: 1 },
    wholeFood: true,
    note: 'Oats, milk or yoghurt, peanut butter',
  },
]);

const clampCount = n => Math.max(0, Math.floor(Number.isFinite(Number(n)) ? Number(n) : 0));

export function describePortions(portions = {}) {
  const parts = [];
  for (const key of PORTION_KEYS) {
    const count = clampCount(portions?.[key]);
    if (count === 0) continue;
    const [single, plural] = PORTION_LABELS[key];
    parts.push(`${count} ${count === 1 ? single : plural}`);
  }
  return parts.join(' · ') || 'No portions';
}

// A rough next-week shopping guide in hand portions. It averages the days
// that were actually logged, then scales to the requested span, so a sparse
// week does not look like a full one. Deliberately not a target.
export function weeklyHandPortions(logs, endDate, days = 7) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate ?? ''))) return null;
  const span = Math.max(1, Math.floor(Number(days) || 7));
  const start = shiftDateStr(endDate, -(span - 1));

  const inRange = (logs || []).filter(log =>
    log?.date
    && /^\d{4}-\d{2}-\d{2}$/.test(log.date)
    && log.date >= start
    && log.date <= endDate
  );

  const totals = Object.fromEntries(PORTION_KEYS.map(key => [key, 0]));
  const dates = new Set();
  let whole = 0;

  for (const log of inRange) {
    dates.add(log.date);
    for (const key of PORTION_KEYS) totals[key] += clampCount(log.handPortions?.[key]);
    if (log.isWholeFood) whole += 1;
  }

  const loggedDays = dates.size;
  const projected = Object.fromEntries(PORTION_KEYS.map(key => [
    key,
    loggedDays ? Math.ceil((totals[key] / loggedDays) * span) : 0,
  ]));

  return {
    days: span,
    start,
    end: endDate,
    logs: inRange.length,
    loggedDays,
    totals,
    projected,
    wholeShare: inRange.length ? Math.round((whole / inRange.length) * 100) : null,
  };
}

function shiftDateStr(dateStr, delta) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta));
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function calcHandPortions({ palms = 0, fists = 0, cupped = 0, thumbs = 0 } = {}) {
  const p = clampCount(palms), f = clampCount(fists), c = clampCount(cupped), t = clampCount(thumbs);
  const proteinGrams = p * PORTION_MACROS.proteinPerPalm;
  const carbsGrams = c * PORTION_MACROS.carbsPerCupped;
  const fatGrams = t * PORTION_MACROS.fatPerThumb;
  const calories = Math.round(
    proteinGrams * PORTION_MACROS.caloriesPerProtein +
    carbsGrams * PORTION_MACROS.caloriesPerCarb +
    fatGrams * PORTION_MACROS.caloriesPerFat
  );
  return {
    palms: p, fists: f, cupped: c, thumbs: t,
    proteinGrams,
    carbsGrams,
    fatGrams,
    calories,
    // fists don't carry macro calories; they're tracked as the vegetable anchor
    vegFists: f,
  };
}

// ── Myth cards ─────────────────────────────────────────────
// Embedded, science-backed micro-education — the antidote to both the
// subscription paywall and the social-media nutrition myth mill.
// { id, myth, truth, action } — keep `myth` short enough for a card.
export const MYTH_CARDS = Object.freeze([
  {
    id: 'myth-dietary-cholesterol',
    myth: 'Dietary cholesterol is the main driver of heart disease.',
    truth: 'For most people, cholesterol in food moves blood cholesterol far less than saturated and trans fats do, and the response varies widely between individuals.',
    action: 'Spend your effort on ultra-processed foods and saturated fat; eggs and shrimp are not the villain for most people.',
  },
  {
    id: 'myth-seed-oils',
    myth: 'Seed oils are the single cause of modern chronic disease.',
    truth: 'Evidence does not support seed oils as a unique cause of chronic disease; overall diet pattern, calorie excess, smoking, alcohol and inactivity matter far more.',
    action: 'Cook with oils you like, but win the bigger battles first: whole foods, fiber, movement, sleep.',
  },
  {
    id: 'myth-carbs-evil',
    myth: 'Carbs are inherently fattening and should be eliminated.',
    truth: 'Carb quality and quantity both matter: fiber-rich whole carbs (legumes, grains, fruit, tubers) are associated with lower risk, while refined carbs are the ones to watch.',
    action: 'Swap refined carbs for beans, oats, fruit and potatoes before cutting carbs entirely.',
  },
  {
    id: 'myth-red-meat-heart',
    myth: 'Red meat inevitably causes heart attacks.',
    truth: 'Observational studies link processed meats (bacon, sausages) more consistently to risk than unprocessed red meat, and the associations are modest either way.',
    action: 'Limit processed meats; keep unprocessed portions near a palm and pair with vegetables.',
  },
  {
    id: 'myth-keto-cure',
    myth: 'A ketogenic diet is objectively the healthiest diet for everyone.',
    truth: 'Keto can help short-term weight loss and is used clinically for some metabolic conditions, but long term, adherence and food quality matter more than the label.',
    action: 'Pick the eating pattern you can sustain for decades, not the one with the best marketing.',
  },
  {
    id: 'myth-small-meals',
    myth: 'You must eat every 2–3 hours to keep your metabolism high.',
    truth: 'Metabolic rate is governed by total intake, body size, protein intake and activity — meal frequency shows little effect on total energy expenditure.',
    action: 'Eat on a rhythm you can keep; don\'t stress-graze to "boost metabolism".',
  },
  {
    id: 'myth-fruit-sugar',
    myth: 'Fruit sugar is just as bad as table sugar.',
    truth: 'Whole fruit pairs sugar with fiber, water and polyphenols, which slows absorption and improves satiety; juice delivers the sugar with much less of that protection.',
    action: 'Eat fruit whole; drink water, not juice.',
  },
  {
    id: 'myth-low-fat-always',
    myth: 'Low-fat foods are always the heart-healthy choice.',
    truth: 'Low-fat products are often reformulated with refined carbs and sugar, which can raise triglycerides — the label says less fat, not better food.',
    action: 'Prefer unpackaged food: fatty fish, nuts, olive oil, avocado — not "fat-free" snack packs.',
  },
  {
    id: 'myth-cholesterol-number',
    myth: 'Lowering one cholesterol number (LDL) is the whole game.',
    truth: 'Risk is multi-factorial: blood pressure, smoking, glucose, lipids, inflammation and fitness all matter. Cardiorespiratory fitness is one of the strongest predictors of long-term mortality — comparable to, or stronger than, several traditional risk factors.',
    action: 'Chase the whole profile: fitness, waist, BP, lipids, glucose. Medication decisions belong with your clinician.',
  },
  {
    id: 'myth-protein-damage',
    myth: 'High-protein diets damage healthy kidneys.',
    truth: 'In people with normal kidney function, higher protein intakes have not shown meaningful harm in short- and medium-term studies. The concern applies to people who already have kidney disease.',
    action: 'If you train and your kidneys are healthy, roughly 1.4–2.0 g/kg is a reasonable range. If you have kidney disease, set protein with your doctor.',
  },
]);

function cardByIndex(i) {
  return { ...MYTH_CARDS[((i % MYTH_CARDS.length) + MYTH_CARDS.length) % MYTH_CARDS.length] };
}

// Deterministic daily card — rotates once per calendar day.
export function getDailyMythCard(dateStr = null) {
  const date = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const epochDay = Math.floor(date.getTime() / 86400000);
  return cardByIndex(epochDay);
}

// Random card — for the "show me another" button.
export function getRandomMythCard(rng = Math.random) {
  return cardByIndex(Math.floor(rng() * MYTH_CARDS.length));
}
