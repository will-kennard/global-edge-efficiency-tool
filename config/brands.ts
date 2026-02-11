export const MONITORED_BRANDS = [
  'https://nike.com',
  'https://apple.com',
  'https://amazon.com',
  'https://google.com',
  'https://microsoft.com',
  'https://facebook.com',
  'https://netflix.com',
  'https://spotify.com',
  'https://adobe.com',
  'https://salesforce.com',
] as const;

export type MonitoredBrand = typeof MONITORED_BRANDS[number];
