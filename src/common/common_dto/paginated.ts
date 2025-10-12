export type PageMeta = {
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type Paginated<T> = {
  items: T[];
  meta: PageMeta;
};