# Myth cards — clinical review sheet

Pulse Fuel rotates one short nutrition card per day. The cards are educational,
not medical advice, but they should still be checked by someone with clinical
training before the app is shared widely. This sheet is the review surface:
each card gets a decision and, where needed, an edit.

**Reviewer instructions**

For each row, read `claim` and `our wording`, then choose one:

- **Keep** — accurate and appropriately hedged for a general audience.
- **Edit** — directionally right but the wording overstates or understates.
  Write the replacement text in `reviewer notes`.
- **Drop** — too contested, too clinical, or not worth the card space.

Please also flag anything that reads as personalized medical advice (e.g. a
target that should only come from a clinician), and anything that could be
harmful if followed by someone with a relevant condition. `action` lines are
the highest-risk part of each card.

**Ground rules for the wording**

- No single food is framed as poison or a cure; effect sizes stay modest.
- Claims are hedged ("for most people", "weak association") where the evidence
  is observational.
- The card never tells the user to stop a prescribed medication or diet.
- Numbers only appear where a guideline body states them.

**Suggested anchors** (starting points for the reviewer, not citations for the
cards themselves): national dietary guidelines in force at review time, WHO
guidance on fats and free sugars, and the major cardiology/metabolic society
statements on diet and cardiovascular risk. Add the exact citation you relied
on in `reviewer notes` if you want it tracked in-repo.

---

## Cards

| # | id | claim (as shown) | our wording (truth) | suggested `action` | decision | reviewer notes |
|---|----|------------------|---------------------|--------------------|----------|----------------|
| 1 | `myth-dietary-cholesterol` | Dietary cholesterol is the main driver of heart disease. | Dietary cholesterol has little effect on blood lipids for most people; saturated and trans fats and excess refined carbs move the needle far more. | Focus on cutting ultra-processed foods instead of fearing eggs or shrimp. | ☐ Keep ☐ Edit ☐ Drop | |
| 2 | `myth-seed-oils` | Seed oils are the single cause of modern chronic disease. | Seed oils are one contributor among many; total calorie excess, ultra-processed food, smoking, alcohol and inactivity dwarf any single-ingredient effect. | Cook with stable oils, but win the bigger battles first: whole foods, fiber, movement, sleep. | ☐ Keep ☐ Edit ☐ Drop | |
| 3 | `myth-carbs-evil` | Carbs are inherently fattening and should be eliminated. | Carb quality and quantity matter: fiber-rich whole carbs (legumes, grains, fruit, tubers) are cardioprotective; refined carbs are the issue. | Swap white refined carbs for beans, oats, fruit and potatoes before cutting carbs entirely. | ☐ Keep ☐ Edit ☐ Drop | |
| 4 | `myth-red-meat-heart` | Red meat inevitably causes heart attacks. | Unprocessed lean red meat has a weak association with risk; processed meats (bacon, sausages) are the consistent problem across studies. | Limit processed meats; keep unprocessed portions near a palm and pair with vegetables. | ☐ Keep ☐ Edit ☐ Drop | |
| 5 | `myth-keto-cure` | A ketogenic diet is objectively the healthiest diet for everyone. | Keto excels for short-term weight loss and some metabolic conditions, but any diet high in whole foods, fiber and unsaturated fat with a calorie balance works long-term. | Pick the eating pattern you can sustain for decades, not the one with the best marketing. | ☐ Keep ☐ Edit ☐ Drop | |
| 6 | `myth-small-meals` | You must eat every 2–3 hours to keep your metabolism high. | Metabolic rate is governed by total intake, body size, protein intake and activity — meal frequency shows no meaningful effect on total energy expenditure. | Eat on a rhythm you can keep; don't stress-graze to "boost metabolism". | ☐ Keep ☐ Edit ☐ Drop | |
| 7 | `myth-fruit-sugar` | Fruit sugar is just as bad as table sugar. | Whole fruit pairs sugar with fiber, water and polyphenols, slowing absorption and improving satiety; juices and smoothies lose most of that protection. | Eat fruit whole; drink water, not juice. | ☐ Keep ☐ Edit ☐ Drop | |
| 8 | `myth-low-fat-always` | Low-fat foods are always the heart-healthy choice. | Low-fat products are often reformulated with refined carbs and sugar, which worsen triglycerides and insulin response. | Prefer unpackaged food: fatty fish, nuts, olive oil, avocado — not "fat-free" snack packs. | ☐ Keep ☐ Edit ☐ Drop | |
| 9 | `myth-cholesterol-number` | Lowering one cholesterol number (LDL) is the whole game. | Risk is multi-factorial: blood pressure, smoking, glucose, HDL, triglycerides, inflammation and fitness all matter — and VO2max rivals medications as a risk predictor. | Chase the whole profile: fitness, waist, BP, lipids, glucose — not just the LDL reading. | ☐ Keep ☐ Edit ☐ Drop | |
| 10 | `myth-protein-damage` | High-protein diets damage healthy kidneys. | In people with normal kidney function, high protein intake shows no meaningful harm; the concern applies to pre-existing kidney disease and is dose-dependent. | Aim for enough protein (roughly 1.6–2.2 g/kg for training); flag true kidney disease with your doctor instead. | ☐ Keep ☐ Edit ☐ Drop | |

---

## Sign-off

- Reviewer name / credentials:
- Date:
- Scope reviewed: wording only ☐ / wording + action lines ☐ / wording + sources ☐
- Overall: approve as-is ☐ / approve with edits below ☐ / needs another pass ☐
- Summary of required edits:

Once reviewed, edit `MYTH_CARDS` in `js/fuel.js` and bump the release (the
cards are embedded, so a wording change ships with the next version).
