import type { Source } from "./types";

// A FICTIONAL everyday-research scenario used for demos. All brands, sites,
// people and figures are invented and labelled as sample data in the UI.
// The sources contain realistic problems on purpose:
//  - S3 is a content-farm article that copies paragraphs from S2 (an "echo"),
//    so two sites agreeing is really one source
//  - S4 is a 2013 forum answer repeating the overcharging and "memory effect" myths
//  - S3 adds a "drain to 0% monthly to calibrate" tip that contradicts the maker
//  - battery lifespan is quoted as ~500 cycles by some sources and 1,000 by the maker
//  - nobody covers battery replacement, warranty, or what to do when health drops

export const SAMPLE_QUESTION = "Is it bad to charge my phone overnight, and how should I charge it so the battery lasts longer?";

export const SAMPLE_SOURCES: Omit<Source, "id">[] = [
  {
    title: "Battery & charging guide | Aurion Phones Support",
    url: "https://aurion-phones.example/support/battery",
    kind: "text",
    date: "2026-05-12",
    dateEvidence: "entered (sample)",
    official: true,
    officialReason: "Phone manufacturer's own support page (sample)",
    sample: true,
    text: `Aurion Support
Battery & charging guide
Last updated: 12 May 2026
Applies to: Aurion One, Aurion One Pro and Aurion Lite (2024 models and later)

Is it safe to charge overnight?
Yes. Aurion phones manage charging automatically and stop drawing current when the battery is full, so the battery cannot be overcharged. For the best long-term battery health, turn on Adaptive Charging in Settings > Battery. With Adaptive Charging on, your phone charges to 80%, waits, and finishes the last 20% shortly before your usual wake-up time.

How long will my battery last?
Aurion batteries are designed to retain at least 80% of their original capacity after 1,000 complete charge cycles. A charge cycle means using 100% of the battery's capacity, not necessarily in a single charge.

Heat is the biggest risk
Avoid charging in hot places such as a car dashboard or under a pillow. The ideal ambient temperature is 16°C to 22°C. If your phone gets hot while charging, remove thick cases. Charging pauses automatically above 40°C.

Fast charging
Fast charging is safe for everyday use, but it produces more heat. For overnight charging we recommend a standard charger or Adaptive Charging.

Do I need to calibrate or fully drain the battery?
No. Lithium-ion batteries have no memory effect. Fully draining the battery is not needed and can increase wear.

Chargers
Use the charger supplied with your phone or a certified USB-C Power Delivery charger. Uncertified chargers may not regulate voltage correctly.`,
  },
  {
    title: "7 phone battery myths, busted",
    url: "https://technest.example/phone-battery-myths",
    kind: "text",
    date: "2024-03-02",
    dateEvidence: "entered (sample)",
    official: false,
    sample: true,
    text: `7 phone battery myths, busted
By Riya Menon, TechNest | 2 March 2024

Myth 1: Charging overnight ruins your battery.
Modern smartphones stop charging when they reach 100 percent, so leaving your phone plugged in overnight will not overcharge it. The real enemy of lithium-ion batteries is heat, not the hours spent on the charger.

Myth 2: You should let your battery drop to zero.
Deep discharges are actually harmful for lithium-ion cells. The sweet spot is to keep your battery between 20 and 80 percent whenever you can, which reduces stress on the cells and helps them last longer.

Myth 3: Fast charging damages your battery.
Fast charging does not damage your battery at all. Phone makers design the battery and the charging circuit together, and the phone slows charging automatically as it fills up.

Myth 4: Batteries die after a year.
Most phone batteries keep around 80 percent of their capacity after roughly 500 full charge cycles, which for most people is about two years of use.

Myth 5: Third-party chargers are dangerous.
A good-quality certified charger from a reputable brand is perfectly safe. Avoid very cheap unbranded chargers.`,
  },
  {
    title: "Is Charging Your Phone Overnight Bad? Experts Explain",
    url: "https://gadgetdailyhub.example/charging-overnight-bad",
    kind: "text",
    date: null,
    official: false,
    sample: true,
    text: `Is Charging Your Phone Overnight Bad? Experts Explain
GadgetDailyHub Staff

Many people worry about leaving their phone on the charger all night. Here is what experts say.

Modern smartphones stop charging when they reach 100 percent, so leaving your phone plugged in overnight will not overcharge it. The real enemy of lithium-ion batteries is heat, not the hours spent on the charger.

Deep discharges are actually harmful for lithium-ion cells. The sweet spot is to keep your battery between 20 and 80 percent whenever you can, which reduces stress on the cells and helps them last longer.

Most phone batteries keep around 80 percent of their capacity after roughly 500 full charge cycles, which for most people is about two years of use.

Pro tip: once a month, let your battery drain completely to 0% and then charge it to 100% without interruption. This calibrates the battery and keeps the percentage reading accurate.

Disclaimer: this article is for general information only.`,
  },
  {
    title: "Should I charge my phone overnight? | PhoneHelp Forums",
    url: "https://phonehelp-forums.example/t/charge-overnight",
    kind: "text",
    date: "2013-08-19",
    dateEvidence: "entered (sample)",
    official: false,
    sample: true,
    text: `Thread: Should I charge my phone overnight?
Posted 19 August 2013

Question from user dk_88: I always leave my phone charging overnight. Is that bad?

Top answer from user battery_guru (1,204 points):
Never charge your phone overnight. Once it reaches 100% the charger keeps pushing current into the battery, which overcharges it and can make it swell or even catch fire. Unplug it as soon as it is full.
Also, always run the battery all the way down to 0% before charging. Batteries remember their capacity, so if you keep topping up at 50% they lose capacity over time. This is called the memory effect.

Reply from user mia_t: Thanks, I will unplug it from now on!`,
  },
  {
    title: "Most smartphone users charge overnight, survey finds",
    url: "https://dailyledger.example/tech/overnight-charging-survey",
    kind: "text",
    date: "2026-09-22",
    dateEvidence: "entered (sample)",
    official: false,
    sample: true,
    text: `Most smartphone users charge overnight, survey finds
The Daily Ledger | Technology Desk | 22 September 2026

Six in ten smartphone owners charge their phones overnight, according to a survey of 2,000 users published this week. Many said they were unsure whether the habit harms their battery.

Battery researchers interviewed for this story said overnight charging is generally safe on recent phones, especially those with an adaptive or optimised charging feature that pauses at 80 percent. They warned that heat remains the main cause of battery wear.

According to the researchers, a typical phone battery retains about 80 percent of its capacity after around 500 full charge cycles, although some 2025 and 2026 models are rated for up to 1,000 cycles.

The survey also found that only one in four users knew whether their phone had a battery health screen.`,
  },
];
