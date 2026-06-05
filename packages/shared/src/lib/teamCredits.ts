export type TeamMember = {
  id: string;
  name: string;
  email: string;
};

export type ProducerMember = {
  id: string;
  name: string;
  email: string;
};

export const COMPANY_NAME = "CTrend";
export const APP_NAME = "Ke Jitbe";
export const APP_DOMAIN = "kejitbe.app";

export const PRIMARY_CONTACT_EMAIL = "badhonkhanbk007@gmail.com";

export const KEJITBE_DEVELOPERS: TeamMember[] = [
  {
    id: "abir",
    name: "Abir Azim Badhon",
    email: "badhonkhanbk007@gmail.com",
  },
  {
    id: "anjan",
    name: "Anjon Kundu",
    email: "anjonkundu509@gmail.com",
  },
  {
    id: "asief",
    name: "Asief Mahir",
    email: "asiefmahir1@gmail.com",
  },
];

export const KEJITBE_PRODUCERS: ProducerMember[] = [
  {
    id: "niaz",
    name: "Niaz Rahman Khan",
    email: "niazrahman2222@gmail.com",
  },
  {
    id: "tushar",
    name: "Tushar Hasan Lavlu",
    email: "tusharhasan076@gmail.com",
  },
  {
    id: "sunny",
    name: "Rahmatulla Sunny",
    email: "Rahmatulla.sunny@gmail.com",
  },
];

export const LEGAL_PAGE_URLS = {
  privacy: `https://${APP_DOMAIN}/privacy`,
  terms: `https://${APP_DOMAIN}/terms`,
  credits: `https://${APP_DOMAIN}/credits`,
} as const;
