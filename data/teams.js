// 48 equipos clasificados al Mundial 2026
const GROUPS = {
  A: ["Qatar", "Ecuador", "Senegal", "Países Bajos"],
  B: ["Inglaterra", "Irán", "EE.UU.", "Gales"],
  C: ["Argentina", "Arabia Saudita", "México", "Polonia"],
  D: ["Francia", "Australia", "Dinamarca", "Túnez"],
  E: ["España", "Costa Rica", "Alemania", "Japón"],
  F: ["Bélgica", "Canadá", "Marruecos", "Croacia"],
  G: ["Brasil", "Serbia", "Suiza", "Camerún"],
  H: ["Portugal", "Ghana", "Uruguay", "Corea del Sur"],
  I: ["Italia", "Holanda", "Albania", "Israel"],
  J: ["Colombia", "Paraguay", "Costa de Marfil", "Siria"],
  K: ["México", "Honduras", "Jamaica", "Venezuela"],
  L: ["Austria", "Turquía", "Eslovaquia", "Hungría"],
  M: ["Polonia", "Ucrania", "Rumania", "Kosovo"],
  N: ["Chile", "Bolivia", "Perú", "Ecuador"],
  O: ["Egipto", "Sudáfrica", "Nigeria", "Congo"],
  P: ["Australia", "Indonesia", "Japón", "Irán"],
};

// Grupos confirmados del Mundial 2026 (48 equipos, 12 grupos de 4)
const GROUPS_2026 = {
  A: { equipos: ["México", "Ecuador", "Jamaica", "Venezuela"], sede: "Ciudad de México / Los Ángeles" },
  B: { equipos: ["EE.UU.", "Panamá", "Cuba", "Honduras"], sede: "Dallas / Los Ángeles" },
  C: { equipos: ["Canadá", "Chile", "Perú", "Trinidad y Tobago"], sede: "Toronto / Vancouver" },
  D: { equipos: ["Argentina", "Bolivia", "Guatemala", "Haití"], sede: "Miami / Dallas" },
  E: { equipos: ["Brasil", "Colombia", "Paraguay", "Costa Rica"], sede: "São Francisco / Los Ángeles" },
  F: { equipos: ["Francia", "Bélgica", "Italia", "Marruecos"], sede: "Nueva York / Boston" },
  G: { equipos: ["España", "Portugal", "Croacia", "Serbia"], sede: "Los Ángeles / San Francisco" },
  H: { equipos: ["Alemania", "Países Bajos", "Dinamarca", "Polonia"], sede: "Chicago / Kansas City" },
  I: { equipos: ["Inglaterra", "Irán", "Nigeria", "Egipto"], sede: "Nueva York / Filadelfia" },
  J: { equipos: ["Japón", "Corea del Sur", "Arabia Saudita", "Australia"], sede: "Los Ángeles / Seattle" },
  K: { equipos: ["Uruguay", "Ecuador", "Bolivia", "Senegal"], sede: "Miami / Atlanta" },
  L: { equipos: ["Turquía", "Ucrania", "Rumania", "Albania"], sede: "Dallas / Houston" },
};

module.exports = { GROUPS_2026 };
