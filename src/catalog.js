export const CATALOG = Object.freeze([
  {
    id: "coffee",
    en: "Coffee",
    ja: "コーヒー",
    price: 350,
    aliases: ["coffees", "coffee", "コーヒー", "珈琲"],
    description: "Freshly brewed black coffee. 温かいブラックコーヒー。",
  },
  {
    id: "tea",
    en: "Tea",
    ja: "紅茶",
    price: 300,
    aliases: ["teas", "tea", "紅茶", "ティー"],
    description: "A cup of hot black tea. 温かい紅茶。",
  },
  {
    id: "croissant",
    en: "Croissant",
    ja: "クロワッサン",
    price: 280,
    aliases: ["croissants", "croissant", "クロワッサン"],
    description:
      "A buttery flaky pastry, baked bread. バターの香りのサクサクしたパン。",
  },
]);
export const product = (id) => CATALOG.find((p) => p.id === id);
export const total = (cart) =>
  Object.entries(cart).reduce((sum, [id, q]) => sum + product(id).price * q, 0);
export const money = (value, language = "en") =>
  new Intl.NumberFormat(language === "ja" ? "ja-JP" : "en-US", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
export const MAX_QUANTITY = 20;
