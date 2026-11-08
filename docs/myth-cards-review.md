# Myth cards — clinical review sheet

Pulse Fuel rotates one short nutrition card per day. The cards are educational,
not medical advice, but they should still be checked by someone with clinical
training before the app is shared widely. This sheet is the review surface:
each card gets a decision and, where needed, an edit.

> **Status (2026-11-07):** no clinician was available, so an **AI-assisted
> conservative pass** was applied for **v2.11.0** and extended for **v2.21.0**
> (six more cards). Every card now ships with an on-screen *"Educational only —
> not medical advice."* line. The clinician sign-off block at the bottom is
> **still open** — treat the current wording as a reviewed-by-nobody draft that
> has been hedged hard, not as clinically approved copy.

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
- Claims are hedged ("for most people", "associated with") where the evidence
  is observational.
- The card never tells the user to stop a prescribed medication or diet.
- Numbers only appear where a guideline body states them.

---

## AI-assisted pass — v2.11.0

No clinician was available, so the cards were revised conservatively against
primary sources. Rules used for the pass:

1. **Observational evidence is named as observational.** No "causes", no
   "inevitably", no single-nutrient villain.
2. **No comparative claims about medication.** The old LDL card said VO2max
   "rivals medications"; it now says fitness is a strong *predictor* of
   mortality and leaves treatment decisions to a clinician.
3. **No medical targets in `action` lines.** The protein range is attributed to
   the ISSN position stand and paired with an explicit "if you have kidney
   disease, set protein with your doctor".
4. **Uncertainty is stated where it exists** (individual cholesterol response,
   food-frequency confounding, modest effect sizes).

### What changed

| id | change |
|---|---|
| `myth-dietary-cholesterol` | "little effect" → "moves blood cholesterol far less than saturated and trans fats", plus individual variation. Action no longer implies eggs are settled for everyone. |
| `myth-seed-oils` | "one contributor among many" → "evidence does not support a unique causal role"; bigger factors listed. |
| `myth-carbs-evil` | "cardioprotective" → "associated with lower risk" (observational hedging). |
| `myth-red-meat-heart` | Explicitly labelled observational; "weak association" → "modest associations" with processed vs unprocessed separated. |
| `myth-keto-cure` | "excels" → "can help short-term"; long-term adherence and food quality foregrounded. |
| `myth-small-meals` | Softened "no meaningful effect" → "little effect"; claim unchanged otherwise. |
| `myth-fruit-sugar` | "lose most of that protection" → "much less of that protection". |
| `myth-low-fat-always` | "which worsen" → "which can raise"; removed the implication that all low-fat products are harmful. |
| `myth-cholesterol-number` | **Largest change.** "VO2max rivals medications" removed. Now: fitness is one of the strongest predictors of long-term mortality, comparable to several traditional risk factors. Action defers medication to the clinician. |
| `myth-protein-damage` | "no meaningful harm" kept but bounded to "short- and medium-term studies"; range corrected to **1.4–2.0 g/kg** (ISSN position stand) and paired with a kidney-disease caveat. |

### References used

- **Cardiorespiratory fitness and mortality** — Mandsager K, et al. *Association
  of Cardiorespiratory Fitness With Long-term Mortality Among Adults Undergoing
  Exercise Treadmill Testing.* JAMA Netw Open. 2018;1(6):e183605.
  doi:10.1001/jamanetworkopen.2018.3605 — lower CRF carried an adjusted hazard
  comparable to or greater than traditional risk factors; no upper limit of
  benefit observed.
- **Fitness as a clinical vital sign** — Ross R, et al. *Importance of Assessing
  Cardiorespiratory Fitness in Clinical Practice: A Case for Fitness as a
  Clinical Vital Sign.* Circulation. 2016;134(24):e653–e699.
  doi:10.1161/CIR.0000000000000461.
- **Protein and kidney function in healthy adults** — Devries MC, et al. *A
  Systematic Review of Renal Health in Healthy Individuals Associated with
  Protein Intake above the US Recommended Daily Allowance in Randomized
  Controlled Trials and Observational Studies.* Adv Nutr. 2018;9(4):404–418.
  doi:10.1093/advances/nmy026 — no meaningful effect on kidney-function markers
  in healthy adults; evidence in existing CKD is a separate question.
- **Protein intake for training** — Jäger R, et al. *International Society of
  Sports Nutrition Position Stand: Protein and Exercise.* J Int Soc Sports Nutr.
  2017;14:20. doi:10.1186/s12970-017-0177-8 — 1.4–2.0 g/kg/day.
- **Meal frequency** — Aragon AA, Schoenfeld BJ. *Nutrient timing revisited: is
  there a post-exercise anabolic window?* J Int Soc Sports Nutr. 2013;10:5,
  and the ISSN meal-frequency position stand — total intake dominates; meal
  frequency has little independent effect on energy expenditure.
- **Dietary fat / cholesterol guidance** — WHO and national dietary guidelines
  in force at review time (saturated fat <10% of energy; replace with
  unsaturated fat).

These are starting citations for a reviewer, not claims of a systematic review.
If a clinician edits a card, add the source they relied on to `reviewer notes`.

### Known residual risk (for the clinician)

1. **`myth-protein-damage` action** still gives a number. It is the ISSN range
   for healthy training adults, but any number can be misapplied by someone
   with undiagnosed CKD.
2. **`myth-cholesterol-number`** touches statin territory. The current wording
   deliberately does not comment on medication benefit.
3. **`myth-low-fat-always`** could be read as "eat unlimited fat". It is framed
   as food quality, not a fat target.
4. **`myth-red-meat-heart`** rests on observational cohorts with residual
   confounding; "modest" is doing a lot of work.
5. **No card covers alcohol or sodium** — deliberate omissions, not endorsements.
6. **`myth-gluten-free`** names coeliac disease and diagnosed sensitivity. The
   reviewer must ensure it reads as a reason not to self-diagnose, not as
   guidance for someone with a diagnosed condition.
7. **`myth-supplements`** must not be read as encouragement to self-treat a
   suspected deficiency. The action deliberately points to testing/clinician.
8. **`myth-detox`** names a product category. It makes no medical claim, but the
   reviewer should confirm the tone stays factual rather than promotional.

---

## v2.21.0 additions — AI-assisted, not clinician-approved

Six cards were added with the same rules as the v2.11.0 pass:

- **Breakfast timing** — no metabolic-slowing claim; individual hunger and routine.
- **Detox products** — no product benefit claimed; liver/kidney function named plainly.
- **Gluten-free for everyone** — coeliac disease / diagnosed sensitivity caveat; no general-health claim.
- **Frozen produce** — convenience and comparable nutrition, not a fresh-vs-frozen contest.
- **Supplement stacks** — food first; targeted use with testing/clinician where relevant.
- **Organic food** — production-method choice; small, inconsistent nutrition differences.

**Reviewer note:** these six cards are the least-sourced in the set. Attach a
primary source for each (or ask for an edit/drop) before sign-off. The `action`
lines are intentionally low-stakes and should not be read as treatment advice.

---

## Cards

| # | id | claim (as shown) | our wording (truth) | suggested `action` | decision | reviewer notes |
|---|----|------------------|---------------------|--------------------|----------|----------------|
| 1 | `myth-dietary-cholesterol` | Dietary cholesterol is the main driver of heart disease. | For most people, cholesterol in food moves blood cholesterol far less than saturated and trans fats do, and the response varies widely between individuals. | Spend your effort on ultra-processed foods and saturated fat; eggs and shrimp are not the villain for most people. | ☐ Keep ☐ Edit ☐ Drop | AI pass: hedged + individual variation |
| 2 | `myth-seed-oils` | Seed oils are the single cause of modern chronic disease. | Evidence does not support seed oils as a unique cause of chronic disease; overall diet pattern, calorie excess, smoking, alcohol and inactivity matter far more. | Cook with oils you like, but win the bigger battles first: whole foods, fiber, movement, sleep. | ☐ Keep ☐ Edit ☐ Drop | AI pass: removed "one contributor" framing |
| 3 | `myth-carbs-evil` | Carbs are inherently fattening and should be eliminated. | Carb quality and quantity both matter: fiber-rich whole carbs (legumes, grains, fruit, tubers) are associated with lower risk, while refined carbs are the ones to watch. | Swap refined carbs for beans, oats, fruit and potatoes before cutting carbs entirely. | ☐ Keep ☐ Edit ☐ Drop | AI pass: "cardioprotective" → "associated with lower risk" |
| 4 | `myth-red-meat-heart` | Red meat inevitably causes heart attacks. | Observational studies link processed meats (bacon, sausages) more consistently to risk than unprocessed red meat, and the associations are modest either way. | Limit processed meats; keep unprocessed portions near a palm and pair with vegetables. | ☐ Keep ☐ Edit ☐ Drop | AI pass: named observational, split processed/unprocessed |
| 5 | `myth-keto-cure` | A ketogenic diet is objectively the healthiest diet for everyone. | Keto can help short-term weight loss and is used clinically for some metabolic conditions, but long term, adherence and food quality matter more than the label. | Pick the eating pattern you can sustain for decades, not the one with the best marketing. | ☐ Keep ☐ Edit ☐ Drop | AI pass: "excels" softened |
| 6 | `myth-small-meals` | You must eat every 2–3 hours to keep your metabolism high. | Metabolic rate is governed by total intake, body size, protein intake and activity — meal frequency shows little effect on total energy expenditure. | Eat on a rhythm you can keep; don't stress-graze to "boost metabolism". | ☐ Keep ☐ Edit ☐ Drop | AI pass: minor hedge |
| 7 | `myth-fruit-sugar` | Fruit sugar is just as bad as table sugar. | Whole fruit pairs sugar with fiber, water and polyphenols, which slows absorption and improves satiety; juice delivers the sugar with much less of that protection. | Eat fruit whole; drink water, not juice. | ☐ Keep ☐ Edit ☐ Drop | AI pass: "lose most" → "much less" |
| 8 | `myth-low-fat-always` | Low-fat foods are always the heart-healthy choice. | Low-fat products are often reformulated with refined carbs and sugar, which can raise triglycerides — the label says less fat, not better food. | Prefer unpackaged food: fatty fish, nuts, olive oil, avocado — not "fat-free" snack packs. | ☐ Keep ☐ Edit ☐ Drop | AI pass: "which worsen" → "which can raise" |
| 9 | `myth-cholesterol-number` | Lowering one cholesterol number (LDL) is the whole game. | Risk is multi-factorial: blood pressure, smoking, glucose, lipids, inflammation and fitness all matter. Cardiorespiratory fitness is one of the strongest predictors of long-term mortality — comparable to, or stronger than, several traditional risk factors. | Chase the whole profile: fitness, waist, BP, lipids, glucose. Medication decisions belong with your clinician. | ☐ Keep ☐ Edit ☐ Drop | AI pass: "VO2max rivals medications" removed (Mandsager 2018; Ross 2016) |
| 10 | `myth-protein-damage` | High-protein diets damage healthy kidneys. | In people with normal kidney function, higher protein intakes have not shown meaningful harm in short- and medium-term studies. The concern applies to people who already have kidney disease. | If you train and your kidneys are healthy, roughly 1.4–2.0 g/kg is a reasonable range. If you have kidney disease, set protein with your doctor. | ☐ Keep ☐ Edit ☐ Drop | AI pass: bounded to short/medium term; range corrected to ISSN 1.4–2.0 g/kg (Devries 2018; Jäger 2017) |
| 11 | `myth-breakfast` | Skipping breakfast slows your metabolism. | Total intake and food quality matter more than the exact timing of your first meal. Breakfast helps some people manage hunger and training; others do fine without it. | Eat breakfast if it helps your day; skip it if you genuinely are not hungry. | ☐ Keep ☐ Edit ☐ Drop | v2.21.0 AI pass: removes the metabolic-slowing claim; reviewer to source |
| 12 | `myth-detox` | Detox teas and cleanses remove toxins. | Healthy livers and kidneys already clear waste. Most detox products have little evidence of meaningful benefit, and some can cause digestive upset. | Spend the money on food, sleep and movement instead. | ☐ Keep ☐ Edit ☐ Drop | v2.21.0 AI pass: no product benefit claimed; reviewer to source |
| 13 | `myth-gluten-free` | Gluten-free is healthier for everyone. | For people without coeliac disease or a diagnosed sensitivity, gluten-free eating has not shown a general health advantage and can be lower in fibre. | Do not cut gluten unless it clearly helps you or a clinician advises it. | ☐ Keep ☐ Edit ☐ Drop | v2.21.0 AI pass: coeliac/sensitivity caveat; clinician review needed |
| 14 | `myth-frozen-produce` | Fresh produce is always more nutritious than frozen. | Frozen fruit and vegetables are usually picked and frozen near harvest and retain comparable nutrients. Convenience often means more vegetables eaten, not fewer. | Keep frozen vegetables and fruit on hand for the days fresh runs out. | ☐ Keep ☐ Edit ☐ Drop | v2.21.0 AI pass: convenience framing; reviewer to source |
| 15 | `myth-supplements` | A supplement stack is the key to good health. | Most people can meet their needs from food. Supplements are useful for specific deficiencies or higher needs, ideally guided by testing and a clinician. | Fix the basics first; treat supplements as targeted tools, not a shortcut. | ☐ Keep ☐ Edit ☐ Drop | v2.21.0 AI pass: no blanket supplement advice; reviewer to source |
| 16 | `myth-organic` | Organic food is always more nutritious. | Organic farming differs in production methods. Nutrition differences are small and inconsistent, and both organic and conventional produce can be part of a healthy diet. | Buy organic if it matters to you; do not skip vegetables if it does not. | ☐ Keep ☐ Edit ☐ Drop | v2.21.0 AI pass: small/inconsistent differences; reviewer to source |

---

## Sign-off

- Reviewer name / credentials:
- Date:
- Scope reviewed: wording only ☐ / wording + action lines ☐ / wording + sources ☐
- Overall: approve as-is ☐ / approve with edits below ☐ / needs another pass ☐
- Summary of required edits:

Once reviewed, edit `MYTH_CARDS` in `js/fuel.js` and bump the release (the
cards are embedded, so a wording change ships with the next version). Keep the
`myth-disclaimer` line in `js/modules/fuel/fuel.js` in place — it is the
in-app statement that these cards are education, not medical advice.
