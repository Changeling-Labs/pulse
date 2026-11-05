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

const clampCount = n => Math.max(0, Math.floor(Number.isFinite(Number(n)) ? Number(n) : 0));

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
    truth: 'Dietary cholesterol has little effect on blood lipids for most people; saturated and trans fats and excess refined carbs move the needle far more.',
    action: 'Focus on cutting ultra-processed foods instead of fearing eggs or shrimp.',
  },
  {
    id: 'myth-seed-oils',
    myth: 'Seed oils are the single cause of modern chronic disease.',
    truth: 'Seed oils are one contributor among many; total calorie excess, ultra-processed food, smoking, alcohol and inactivity dwarf any single-ingredient effect.',
    action: 'Cook with stable oils, but win the bigger battles first: whole foods, fiber, movement, sleep.',
  },
  {
    id: 'myth-carbs-evil',
    myth: 'Carbs are inherently fattening and should be eliminated.',
    truth: 'Carb quality and quantity matter: fiber-rich whole carbs (legumes, grains, fruit, tubers) are cardioprotective; refined carbs are the issue.',
    action: 'Swap white refined carbs for beans, oats, fruit and potatoes before cutting carbs entirely.',
  },
  {
    id: 'myth-red-meat-heart',
    myth: 'Red meat inevitably causes heart attacks.',
    truth: 'Unprocessed lean red meat has a weak association with risk; processed meats (bacon, sausages) are the consistent problem across studies.',
    action: 'Limit processed meats; keep unprocessed portions near a palm and pair with vegetables.',
  },
  {
    id: 'myth-keto-cure',
    myth: 'A ketogenic diet is objectively the healthiest diet for everyone.',
    truth: 'Keto excels for short-term weight loss and some metabolic conditions, but any diet high in whole foods, fiber and unsaturated fat with a calorie balance works long-term.',
    action: 'Pick the eating pattern you can sustain for decades, not the one with the best marketing.',
  },
  {
    id: 'myth-small-meals',
    myth: 'You must eat every 2–3 hours to keep your metabolism high.',
    truth: 'Metabolic rate is governed by total intake, body size, protein intake and activity — meal frequency shows no meaningful effect on total energy expenditure.',
    action: 'Eat on a rhythm you can keep; don\'t stress-graze to "boost metabolism".',
  },
  {
    id: 'myth-fruit-sugar',
    myth: 'Fruit sugar is just as bad as table sugar.',
    truth: 'Whole fruit pairs sugar with fiber, water and polyphenols, slowing absorption and improving satiety; juices and smoothies lose most of that protection.',
    action: 'Eat fruit whole; drink water, not juice.',
  },
  {
    id: 'myth-low-fat-always',
    myth: 'Low-fat foods are always the heart-healthy choice.',
    truth: 'Low-fat products are often reformulated with refined carbs and sugar, which worsen triglycerides and insulin response.',
    action: 'Prefer unpackaged food: fatty fish, nuts, olive oil, avocado — not "fat-free" snack packs.',
  },
  {
    id: 'myth-cholesterol-number',
    myth: 'Lowering one cholesterol number (LDL) is the whole game.',
    truth: 'Risk is multi-factorial: blood pressure, smoking, glucose, HDL, triglycerides, inflammation and fitness all matter — and VO2max rivals medications as a risk predictor.',
    action: 'Chase the whole profile: fitness, waist, BP, lipids, glucose — not just the LDL reading.',
  },
  {
    id: 'myth-protein-damage',
    myth: 'High-protein diets damage healthy kidneys.',
    truth: 'In people with normal kidney function, high protein intake shows no meaningful harm; the concern applies to pre-existing kidney disease and is dose-dependent.',
    action: 'Aim for enough protein (roughly 1.6–2.2 g/kg for training); flag true kidney disease with your doctor instead.',
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
