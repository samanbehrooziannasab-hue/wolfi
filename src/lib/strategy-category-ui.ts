const CATEGORY_LABELS_FA: Record<string, string> = {
  price_action: "پرایس اکشن",
  chart_patterns: "الگوهای نموداری",
  trend_following: "پیروی از روند",
  momentum: "مومنتوم",
  mean_reversion: "بازگشت به میانگین",
  breakout: "بریک‌اوت",
  scalping: "اسکالپینگ",
  swing: "سوینگ",
  smc: "اس‌ام‌سی (SMC)",
  ict: "آی‌سی‌تی (ICT)",
  volume: "حجم",
  volatility: "نوسان‌پذیری",
  support_resistance: "حمایت و مقاومت",
  multi_timeframe: "چند تایم‌فریم",
  market_structure: "ساختار بازار",
  liquidity: "نقدینگی",
  indicator_combos: "ترکیب اندیکاتورها",
};

let scheduled = false;

function categoryLabel(category: string, rtl: boolean): string {
  if (rtl) return CATEGORY_LABELS_FA[category] ?? category;
  return category.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function applyFilter(rows: HTMLTableRowElement[], headers: HTMLTableRowElement[], category: string): void {
  rows.forEach((row) => {
    row.hidden = category !== "all" && row.dataset.category !== category;
  });
  headers.forEach((row) => {
    row.hidden = category !== "all" && row.dataset.category !== category;
  });
}

function enhanceStrategyTable(): boolean {
  if (typeof document === "undefined") return false;

  const table = Array.from(document.querySelectorAll("table")).find((candidate) =>
    Array.from(candidate.querySelectorAll("tbody tr")).some((row) => {
      const firstCell = row.querySelector("td");
      return Boolean(firstCell?.textContent?.includes("_") && row.children.length >= 6);
    }),
  ) as HTMLTableElement | undefined;
  if (!table || table.dataset.categoryUi === "ready") return Boolean(table);

  const body = table.tBodies[0];
  if (!body) return false;
  const rows = Array.from(body.rows).filter((row) => row.children.length >= 6) as HTMLTableRowElement[];
  if (rows.length === 0) return false;

  table.dataset.categoryUi = "ready";
  const rtl = Boolean(table.closest('[dir="rtl"]'));
  const grouped = new Map<string, HTMLTableRowElement[]>();
  rows.forEach((row) => {
    const category = row.cells[2]?.textContent?.trim() || "other";
    row.dataset.category = category;
    const group = grouped.get(category) ?? [];
    group.push(row);
    grouped.set(category, group);
  });

  const headers: HTMLTableRowElement[] = [];
  grouped.forEach((categoryRows, category) => {
    const header = document.createElement("tr");
    header.dataset.category = category;
    header.className = "strategy-category-row border-b border-border/40 bg-emerald-400/5";
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "px-3 py-2 text-xs font-bold text-emerald-300";
    cell.textContent = `${categoryLabel(category, rtl)} · ${categoryRows.length}`;
    header.appendChild(cell);
    body.insertBefore(header, categoryRows[0]);
    headers.push(header);
  });

  const wrapper = table.parentElement;
  const cardContent = wrapper?.parentElement;
  if (!cardContent) return true;

  const toolbar = document.createElement("div");
  toolbar.className = "strategy-category-toolbar flex flex-wrap items-center gap-1.5 border-b border-border/50 bg-background/30 p-3";
  const title = document.createElement("span");
  title.className = "me-1 text-[11px] font-bold text-muted-foreground";
  title.textContent = rtl ? "دسته‌بندی:" : "Category:";
  toolbar.appendChild(title);

  const buttonByCategory = new Map<string, HTMLButtonElement>();
  const categories = ["all", ...grouped.keys()];
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rounded-md border border-border/60 px-2.5 py-1 text-[11px] transition-colors hover:border-emerald-400/40";
    button.textContent = category === "all" ? (rtl ? "همه" : "All") : categoryLabel(category, rtl);
    button.addEventListener("click", () => {
      buttonByCategory.forEach((item, key) => {
        item.classList.toggle("border-emerald-400/50", key === category);
        item.classList.toggle("bg-emerald-400/10", key === category);
        item.classList.toggle("text-emerald-300", key === category);
      });
      applyFilter(rows, headers, category);
    });
    buttonByCategory.set(category, button);
    toolbar.appendChild(button);
  });
  cardContent.prepend(toolbar);
  buttonByCategory.get("all")?.click();
  return true;
}

export function scheduleStrategyCategoryUi(): void {
  if (typeof window === "undefined" || scheduled) return;
  scheduled = true;
  let attempts = 0;
  const run = () => {
    scheduled = false;
    if (enhanceStrategyTable()) return;
    if (attempts++ < 20) {
      scheduled = true;
      window.setTimeout(run, 100);
    }
  };
  window.setTimeout(run, 0);
}
