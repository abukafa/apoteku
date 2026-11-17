import type { Snippet } from "svelte";

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  key: string;
  direction: SortDirection;
}

export type ColumnDataType = "string" | "number" | "date" | "currency" | "boolean" | "custom";

export interface DataTableProps<T = any> {
  // Data Source (Optional for auto-pagination & auto-sorting)
  data?: T[];
  totalCount?: number;
  isLoading?: boolean;
  emptyText?: string;
  emptyIcon?: any;

  // Title & Header Elements (Flexible)
  title?: string;
  subtitle?: string;
  titleContent?: Snippet;
  badgeContent?: Snippet;

  // Search & Filter Controls
  showSearch?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  filters?: Snippet;
  actions?: Snippet;
  bulkActions?: Snippet;

  // Sorting
  sortable?: boolean;
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  sortKey?: string;
  sortDirection?: SortDirection;
  onSortChange?: (state: SortState) => void;

  // Snippet Slots
  header?: Snippet;
  rows?: Snippet;
  footerSummary?: Snippet;

  // Pagination Controls
  pageSize?: number;
  pageSizeOptions?: number[];
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

/**
 * Utilitas perbandingan multi-tipe untuk pengurutan data tabel
 */
export function compareTableValues(
  valA: any,
  valB: any,
  direction: SortDirection = "asc",
  dataType: ColumnDataType = "string"
): number {
  if (!direction) return 0;
  if (valA === valB) return 0;
  if (valA === null || valA === undefined || valA === "") return 1;
  if (valB === null || valB === undefined || valB === "") return -1;

  let comparison = 0;

  switch (dataType) {
    case "number":
    case "currency": {
      const numA = typeof valA === "number" ? valA : Number(String(valA).replace(/[^0-9.-]+/g, "")) || 0;
      const numB = typeof valB === "number" ? valB : Number(String(valB).replace(/[^0-9.-]+/g, "")) || 0;
      comparison = numA - numB;
      break;
    }

    case "date": {
      const dateA = new Date(valA).getTime();
      const dateB = new Date(valB).getTime();
      if (isNaN(dateA) && isNaN(dateB)) {
        comparison = String(valA).localeCompare(String(valB));
      } else if (isNaN(dateA)) {
        comparison = -1;
      } else if (isNaN(dateB)) {
        comparison = 1;
      } else {
        comparison = dateA - dateB;
      }
      break;
    }

    case "boolean": {
      comparison = (valA ? 1 : 0) - (valB ? 1 : 0);
      break;
    }

    case "string":
    default: {
      comparison = new Intl.Collator("id-ID", {
        sensitivity: "base",
        numeric: true
      }).compare(String(valA), String(valB));
      break;
    }
  }

  return direction === "asc" ? comparison : -comparison;
}

/**
 * Siklus Tri-State pengurutan: null -> asc -> desc -> null
 */
export function getNextSortDirection(currentDirection: SortDirection): SortDirection {
  if (currentDirection === null || currentDirection === undefined) return "asc";
  if (currentDirection === "asc") return "desc";
  return null;
}
