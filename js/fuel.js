// ── Pulse Fuel — business logic ────────────────────────────
//
// The unit of account is a hand portion (no barcode database), but the hand
// shape is a *size*, not a food category. A meal has four independent
// components:
//   protein, veg, carbs, fat
// and each component chooses one of:
//   thumb, palm, cupped, fist
// The macro table below turns (category, size, count) into rough grams.
// The legacy handPortions shape (palms/fists/cupped/thumbs) is still accepted
// and derived for older readers and the weekly shopping guide.
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

// ── Category × size model (v2.25.0) ───────────────────────
// The category says what the food is; the hand size says how much. They are
// deliberately independent: a fist of diced chicken and a palm of bread are
// both valid estimates. The old handPortions shape is kept as a derived
// compatibility field for older app versions, backups and the weekly guide.
export const COMPONENT_KEYS = Object.freeze(['protein', 'veg', 'carbs', 'fat']);
export const PORTION_SIZES = Object.freeze(['fist', 'cupped', 'palm', 'thumb']);

export const COMPONENT_META = Object.freeze({
  protein: { label: 'Protein', tone: 'protein', defaultSize: 'palm', examples: 'steak, fish, eggs, tofu, yoghurt, beans' },
  veg: { label: 'Vegetables', tone: 'veg', defaultSize: 'fist', examples: 'salad, broccoli, peppers, greens' },
  carbs: { label: 'Carbs', tone: 'carbs', defaultSize: 'cupped', examples: 'rice, oats, potatoes, bread, fruit' },
  fat: { label: 'Fat', tone: 'fat', defaultSize: 'thumb', examples: 'oil, butter, cheese, nuts, avocado' },
});

export const WHOLE_FOOD_LEVELS = Object.freeze(['whole', 'mixed', 'processed']);

export const WHOLE_FOOD_META = Object.freeze({
  whole: { label: 'Whole', hint: 'Mostly whole' },
  mixed: { label: 'Mixed', hint: 'A mix of whole and processed' },
  processed: { label: 'Processed', hint: 'Mostly processed' },
});

// Weighted share used by the daily card and weekly guide. A mixed meal counts
// as half whole; that is deliberately a rough summary, not a nutrient score.
export function wholeFoodScore(value) {
  const level = WHOLE_FOOD_LEVELS.includes(value) ? value : 'whole';
  return level === 'whole' ? 1 : level === 'mixed' ? 0.5 : 0;
}

export const SIZE_META = Object.freeze({
  fist: { label: 'Fist', plural: 'fists', hand: '✊', volume: '~1 cup', examples: 'vegetables, fruit, diced meat' },
  cupped: { label: 'Cupped', plural: 'cupped', hand: '🫴', volume: '~½ cup', examples: 'rice, yoghurt, nuts' },
  palm: { label: 'Palm', plural: 'palms', hand: '🖐️', volume: '~3 oz', examples: 'steak, fish, chicken' },
  thumb: { label: 'Thumb', plural: 'thumbs', hand: '👍', volume: '~1 tbsp', examples: 'oil, butter, cheese' },
});

export const DEFAULT_COMPONENT_SIZES = Object.freeze(
  Object.fromEntries(COMPONENT_KEYS.map(key => [key, COMPONENT_META[key].defaultSize]))
);

// Grams of the component's macro per portion. Vegetables carry no macro
// estimate in Pulse; they count as veg portions instead.
export const COMPONENT_PORTION_MACROS = Object.freeze({
  protein: Object.freeze({ thumb: 10, palm: 25, cupped: 30, fist: 40 }),
  carbs: Object.freeze({ thumb: 5, palm: 10, cupped: 15, fist: 30 }),
  fat: Object.freeze({ thumb: 10, palm: 20, cupped: 15, fist: 30 }),
  veg: Object.freeze({ thumb: 0, palm: 0, cupped: 0, fist: 0 }),
});

const VEG_PORTION_WEIGHT = Object.freeze({ thumb: 0.25, palm: 0.5, cupped: 0.75, fist: 1 });
const clampCount = n => Math.max(0, Math.floor(Number.isFinite(Number(n)) ? Number(n) : 0));

export function componentsFromHandPortions(portions = {}) {
  return {
    protein: { size: 'palm', count: clampCount(portions?.palms) },
    veg: { size: 'fist', count: clampCount(portions?.fists) },
    carbs: { size: 'cupped', count: clampCount(portions?.cupped) },
    fat: { size: 'thumb', count: clampCount(portions?.thumbs) },
  };
}

// Accepts either the new { protein: { size, count }, … } shape or the legacy
// { palms, fists, cupped, thumbs } shape. Missing or garbage entries fall back
// to the category's common size and a zero count.
export function normalizeMealComponents(value = {}) {
  if (value && typeof value === 'object' &&
      ['palms', 'fists', 'cupped', 'thumbs'].some(key => key in value)) {
    return componentsFromHandPortions(value);
  }

  const out = {};
  for (const key of COMPONENT_KEYS) {
    const entry = value?.[key];
    const size = entry && typeof entry === 'object' && PORTION_SIZES.includes(entry.size)
      ? entry.size
      : DEFAULT_COMPONENT_SIZES[key];
    const count = clampCount(typeof entry === 'number' ? entry : entry?.count);
    out[key] = { size, count };
  }
  return out;
}

export function calcMealComponents(components = {}) {
  const normalized = normalizeMealComponents(components);
  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;
  let vegPortions = 0;

  for (const key of COMPONENT_KEYS) {
    const { size, count } = normalized[key];
    if (key === 'veg') {
      vegPortions += count * VEG_PORTION_WEIGHT[size];
      continue;
    }
    const grams = count * COMPONENT_PORTION_MACROS[key][size];
    if (key === 'protein') proteinGrams += grams;
    if (key === 'carbs') carbsGrams += grams;
    if (key === 'fat') fatGrams += grams;
  }

  const calories = Math.round(
    proteinGrams * PORTION_MACROS.caloriesPerProtein +
    carbsGrams * PORTION_MACROS.caloriesPerCarb +
    fatGrams * PORTION_MACROS.caloriesPerFat
  );

  return {
    components: normalized,
    proteinGrams,
    carbsGrams,
    fatGrams,
    calories,
    vegPortions: Math.round(vegPortions * 100) / 100,
  };
}

// Derive the old category-shaped hand counts for older readers and the
// weekly shopping guide. A fist of protein becomes ~2 palms, not a fist, so
// the legacy field keeps its original "palms = protein" meaning.
export function handPortionsFromComponents(components = {}) {
  const normalized = normalizeMealComponents(components);
  const protein = (normalized.protein.count * COMPONENT_PORTION_MACROS.protein[normalized.protein.size]) / PORTION_MACROS.proteinPerPalm;
  const veg = normalized.veg.count * VEG_PORTION_WEIGHT[normalized.veg.size];
  const carbs = (normalized.carbs.count * COMPONENT_PORTION_MACROS.carbs[normalized.carbs.size]) / PORTION_MACROS.carbsPerCupped;
  const fat = (normalized.fat.count * COMPONENT_PORTION_MACROS.fat[normalized.fat.size]) / PORTION_MACROS.fatPerThumb;

  return {
    palms: Math.round(protein),
    fists: Math.round(veg),
    cupped: Math.round(carbs),
    thumbs: Math.round(fat),
  };
}

export function describeComponents(components = {}) {
  const normalized = normalizeMealComponents(components);
  const parts = [];
  for (const key of COMPONENT_KEYS) {
    const { size, count } = normalized[key];
    if (!count) continue;
    const label = COMPONENT_META[key].label;
    const sizeMeta = SIZE_META[size];
    parts.push(`${label} ${count} ${count === 1 ? sizeMeta.label.toLowerCase() : sizeMeta.plural}`);
  }
  return parts.join(' · ') || 'No portions';
}

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
    emoji: '🍳',
    portions: { palms: 2, fists: 0, cupped: 2, thumbs: 1 },
    wholeFood: true,
    note: 'Eggs, wholegrain toast, butter or oil',
  },
  {
    id: 'chicken-rice-bowl',
    name: 'Chicken rice bowl',
    emoji: '🍗',
    portions: { palms: 2, fists: 2, cupped: 1, thumbs: 1 },
    wholeFood: true,
    note: 'Chicken, rice, mixed veg, olive oil',
  },
  {
    id: 'salmon-potato',
    name: 'Salmon & potatoes',
    emoji: '🐟',
    portions: { palms: 2, fists: 2, cupped: 1, thumbs: 1 },
    wholeFood: true,
    note: 'Salmon, potatoes, greens',
  },
  {
    id: 'yoghurt-berries',
    name: 'Yoghurt & berries',
    emoji: '🫐',
    portions: { palms: 1, fists: 1, cupped: 1, thumbs: 0 },
    wholeFood: true,
    note: 'Greek yoghurt, berries, oats',
  },
  {
    id: 'tofu-stirfry',
    name: 'Tofu stir-fry',
    emoji: '🍲',
    portions: { palms: 2, fists: 2, cupped: 1, thumbs: 1 },
    wholeFood: true,
    note: 'Tofu, mixed veg, rice, sesame oil',
  },
  {
    id: 'beans-toast',
    name: 'Beans on toast',
    emoji: '🍞',
    portions: { palms: 1, fists: 2, cupped: 2, thumbs: 1 },
    wholeFood: true,
    note: 'Beans, wholegrain toast, olive oil',
  },
  {
    id: 'oats-peanut-butter',
    name: 'Oats & peanut butter',
    emoji: '🥣',
    portions: { palms: 1, fists: 0, cupped: 2, thumbs: 1 },
    wholeFood: true,
    note: 'Oats, milk or yoghurt, peanut butter',
  },
]);

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
  let wholeScore = 0;

  for (const log of inRange) {
    dates.add(log.date);
    for (const key of PORTION_KEYS) totals[key] += clampCount(log.handPortions?.[key]);
    const level = WHOLE_FOOD_LEVELS.includes(log.wholeFoodLevel)
      ? log.wholeFoodLevel
      : (log.isWholeFood === false ? 'processed' : 'whole');
    wholeScore += wholeFoodScore(level);
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
    wholeShare: inRange.length ? Math.round((wholeScore / inRange.length) * 100) : null,
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
  {
    id: 'myth-breakfast',
    myth: 'Skipping breakfast slows your metabolism.',
    truth: 'Total intake and food quality matter more than the exact timing of your first meal. Breakfast helps some people manage hunger and training; others do fine without it.',
    action: 'Eat breakfast if it helps your day; skip it if you genuinely are not hungry.',
  },
  {
    id: 'myth-detox',
    myth: 'Detox teas and cleanses remove toxins.',
    truth: 'Healthy livers and kidneys already clear waste. Most detox products have little evidence of meaningful benefit, and some can cause digestive upset.',
    action: 'Spend the money on food, sleep and movement instead.',
  },
  {
    id: 'myth-gluten-free',
    myth: 'Gluten-free is healthier for everyone.',
    truth: 'For people without coeliac disease or a diagnosed sensitivity, gluten-free eating has not shown a general health advantage and can be lower in fibre.',
    action: 'Do not cut gluten unless it clearly helps you or a clinician advises it.',
  },
  {
    id: 'myth-frozen-produce',
    myth: 'Fresh produce is always more nutritious than frozen.',
    truth: 'Frozen fruit and vegetables are usually picked and frozen near harvest and retain comparable nutrients. Convenience often means more vegetables eaten, not fewer.',
    action: 'Keep frozen vegetables and fruit on hand for the days fresh runs out.',
  },
  {
    id: 'myth-supplements',
    myth: 'A supplement stack is the key to good health.',
    truth: 'Most people can meet their needs from food. Supplements are useful for specific deficiencies or higher needs, ideally guided by testing and a clinician.',
    action: 'Fix the basics first; treat supplements as targeted tools, not a shortcut.',
  },
  {
    id: 'myth-organic',
    myth: 'Organic food is always more nutritious.',
    truth: 'Organic farming differs in production methods. Nutrition differences are small and inconsistent, and both organic and conventional produce can be part of a healthy diet.',
    action: 'Buy organic if it matters to you; do not skip vegetables if it does not.',
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
