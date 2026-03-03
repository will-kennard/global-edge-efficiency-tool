import { MONITORED_BRANDS as ORIGINAL_BRANDS } from '@/config/brands';
import { MONITORED_BRANDS as TECH_STACK_BRANDS } from '@/config/tech-stack-brands';

export interface Brand {
  company_url: string;
  company_tech_stack: string;
}

export interface BrandList {
  key: string;
  label: string;
  brands: Brand[];
}

const originalList: Brand[] = ORIGINAL_BRANDS.map((url) => ({
  company_url: url,
  company_tech_stack: '',
}));

export const BRAND_LISTS: BrandList[] = [
  {
    key: 'original',
    label: 'Original 10',
    brands: originalList,
  },
  {
    key: 'tech-stack',
    label: 'Top 60 Global Brands',
    brands: TECH_STACK_BRANDS as Brand[],
  },
];

export const DEFAULT_BRAND_LIST_KEY = BRAND_LISTS[0].key;

const techStackMap = new Map<string, string>(
  BRAND_LISTS.flatMap((list) =>
    list.brands.map((b) => [b.company_url, b.company_tech_stack] as const)
  )
);

/**
 * Look up tech stack for a brand URL across all known brand lists.
 * Returns empty string if not found or tech stack is empty.
 */
export function getTechStack(url: string): string {
  return techStackMap.get(url) ?? '';
}
