import type { BusinessConfig } from "./config";

// A seeded demo so `npm run dev` shows a working product with no Supabase or
// generated demos yet. Served at /demo/sunrise-dental-pasadena when Supabase
// isn't configured or the slug isn't found locally.
export const SAMPLE_SLUG = "sunrise-dental-pasadena";

export const SAMPLE_CONFIG: BusinessConfig = {
  business_name: "Sunrise Dental",
  niche: "dentist",
  city: "Pasadena, CA",
  phone: "(626) 555-0142",
  website: "https://sunrisedental.example",
  tone: "Warm and family-friendly, plain-spoken, reassuring to nervous patients.",
  hours: [
    { days: "Mon–Thu", hours: "8:00am – 5:00pm" },
    { days: "Fri", hours: "8:00am – 1:00pm" },
    { days: "Sat–Sun", hours: "Closed" },
  ],
  services: [
    "Cleanings & exams",
    "Fillings",
    "Crowns & bridges",
    "Teeth whitening",
    "Invisalign",
    "Emergency dental care",
  ],
  knowledge_base: [
    {
      q: "What are your hours?",
      a: "We're open Monday through Thursday 8am–5pm and Friday 8am–1pm. Closed weekends.",
    },
    {
      q: "Do you take Delta Dental?",
      a: "Yes — we accept Delta Dental, MetLife, Cigna, and most major PPO plans.",
    },
    {
      q: "Do you see new patients?",
      a: "Absolutely! New patients are welcome, and your first visit includes a full exam and X-rays.",
    },
    {
      q: "Where are you located?",
      a: "We're at 1240 E Colorado Blvd in Pasadena, with free parking behind the building.",
    },
    {
      q: "Do you handle dental emergencies?",
      a: "Yes, we keep same-day slots for emergencies — call the office as early as you can.",
    },
    {
      q: "Do you offer payment plans?",
      a: "We offer CareCredit financing and flexible payment plans for larger treatments.",
    },
  ],
  insurance_payment: ["Delta Dental", "MetLife", "Cigna", "Most PPO plans", "CareCredit"],
  escalation_message:
    "Great question — I don't have that detail on hand, but the front desk does! Call us at (626) 555-0142, or leave your name and number and we'll get right back to you.",
  suggested_questions: [
    "What are your hours?",
    "Do you take Delta Dental?",
    "How soon can a new patient get in?",
  ],
  widget_color: "#0e7490",
};
