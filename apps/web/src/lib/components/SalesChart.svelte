<script lang="ts">
  import { LineChart } from "lucide-svelte";

  interface DayItem {
    date?: string;
    label: string;
    sales: number;
    salesStr?: string;
    trxs: number;
  }

  interface Props {
    chartData?: DayItem[];
  }

  let { chartData = [] }: Props = $props();

  // If chartData is empty, generate 7 days default
  let days = $derived.by(() => {
    if (chartData && chartData.length > 0) {
      return chartData;
    }
    const arr: DayItem[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      arr.push({
        label: `${d.getDate()} ${monthNames[d.getMonth()]}`,
        sales: 0,
        salesStr: "0",
        trxs: 0
      });
    }
    return arr;
  });

  let hoveredIndex = $state<number | null>(null);

  // SVG coordinates use the same aspect ratio as the chart container.
  const width = 500;
  const height = 200;
  const paddingX = 56;
  const plotTop = 18;
  const plotBottom = 158;
  const xAxisLabelY = 187;

  let maxSalesCeil = $derived.by(() => {
    const rawMax = Math.max(...days.map((d) => d.sales), 0);
    if (rawMax > 5000000) return Math.ceil(rawMax / 1000000) * 1000000;
    if (rawMax > 1000000) return Math.ceil(rawMax / 500000) * 500000;
    if (rawMax > 200000) return 1000000;
    return 500000;
  });

  let maxTrx = $derived.by(() => {
    const rawMax = Math.max(...days.map((d) => d.trxs), 0);
    return Math.max(10, Math.ceil(rawMax * 1.25));
  });

  function getSalesY(val: number) {
    const ratio = Math.min(1, Math.max(0, val / maxSalesCeil));
    return plotBottom - ratio * (plotBottom - plotTop);
  }

  function getTrxY(val: number) {
    const ratio = Math.min(1, Math.max(0, val / maxTrx));
    return plotBottom - ratio * (plotBottom - plotTop);
  }

  function getX(idx: number) {
    const total = Math.max(1, days.length - 1);
    return paddingX + (idx / total) * (width - 2 * paddingX);
  }

  // Construct SVG paths
  let salesPath = $derived(
    days.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getSalesY(d.sales)}`).join(" ")
  );

  let trxPath = $derived(
    days.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getTrxY(d.trxs)}`).join(" ")
  );

  // Gradient area path for sales
  let salesAreaPath = $derived(
    `${salesPath} L ${getX(days.length - 1)} ${plotBottom} L ${getX(0)} ${plotBottom} Z`
  );

  let gridValues = $derived([
    0,
    Math.round(maxSalesCeil * 0.33),
    Math.round(maxSalesCeil * 0.66),
    maxSalesCeil
  ]);

  function formatGridLabel(val: number) {
    if (val === 0) return "0";
    if (val >= 1000000) {
      const jt = val / 1000000;
      return `${jt % 1 === 0 ? jt : jt.toFixed(1)} jt`;
    }
    return `${Math.round(val / 1000)} rb`;
  }
</script>

<div class="h-full min-h-0 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
  <!-- HEADER & LEGEND -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
    <div class="flex items-center gap-2">
      <LineChart class="w-5 h-5 text-[#0c2e7a]" />
      <h3 class="text-sm font-bold text-slate-800">Pekan Terakhir</h3>
    </div>
    <!-- Legend -->
    <div class="flex items-center gap-4 text-[10px] font-semibold">
      <div class="flex items-center gap-1.5 text-slate-600">
        <span class="w-3 h-3 rounded-full bg-[#1d63d8]"></span>
        <span>Penjualan</span>
      </div>
      <div class="flex items-center gap-1.5 text-slate-600">
        <span class="w-3 h-3 rounded-full bg-[#df1c2d]"></span>
        <span>Transaksi</span>
      </div>
    </div>
  </div>

  <!-- SVG CHART CONTAINER -->
  <div class="relative w-full aspect-[2.5/1] min-h-[190px]">
    <svg viewBox="0 0 {width} {height}" class="w-full h-full overflow-hidden">
      <defs>
        <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1d63d8" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#1d63d8" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Y Axis Grid Lines -->
      {#each gridValues as gridVal}
        {@const y = getSalesY(gridVal)}
        <line
          x1={paddingX}
          y1={y}
          x2={width - paddingX}
          y2={y}
          stroke="#f1f5f9"
          stroke-dasharray="4 4"
          stroke-width="1.25"
        />
        <text
          x={paddingX - 8}
          y={y + 3}
          fill="#94a3b8"
          font-size="16"
          font-weight="600"
          text-anchor="end"
        >
          {formatGridLabel(gridVal)}
        </text>
      {/each}

      <!-- Sales Area Fill -->
      <path d={salesAreaPath} fill="url(#salesGradient)" />

      <!-- Sales Line (Blue) -->
      <path
        d={salesPath}
        fill="none"
        stroke="#1d63d8"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Transactions Line (Red) -->
      <path
        d={trxPath}
        fill="none"
        stroke="#df1c2d"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Dots & Hover Interaction -->
      {#each days as day, i}
        {@const sx = getX(i)}
        {@const sy = getSalesY(day.sales)}
        {@const ty = getTrxY(day.trxs)}
        {@const isHovered = hoveredIndex === i}

        <!-- Hover column trigger -->
        <rect
          role="presentation"
          x={sx - 15}
          y="0"
          width="30"
          height={height}
          fill="transparent"
          class="cursor-pointer"
          onmouseenter={() => (hoveredIndex = i)}
          onmouseleave={() => (hoveredIndex = null)}
        />

        {#if isHovered}
          <line
            x1={sx}
            y1={plotTop}
            x2={sx}
            y2={plotBottom}
            stroke="#cbd5e1"
            stroke-dasharray="2 2"
          />
        {/if}

        <!-- Sales Blue Dot -->
        <circle
          cx={sx}
          cy={sy}
          r={isHovered ? "9" : "8"}
          fill="#1d63d8"
          stroke="#ffffff"
          stroke-width="2.5"
          class="transition-all duration-150"
        />

        <!-- Trx Red Dot -->
        <circle
          cx={sx}
          cy={ty}
          r={isHovered ? "8" : "7"}
          fill="#df1c2d"
          stroke="#ffffff"
          stroke-width="2.5"
          class="transition-all duration-150"
        />

        <!-- X Axis Label -->
        <text
          x={sx}
          y={xAxisLabelY}
          fill="#64748b"
          font-size="14"
          font-weight="600"
          text-anchor="middle"
        >
          {day.label}
        </text>
      {/each}
    </svg>

    <!-- Tooltip on hover -->
    {#if hoveredIndex !== null && days[hoveredIndex]}
      {@const d = days[hoveredIndex]}
      <div
        class="absolute -top-1 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[11px] font-semibold py-1 px-2.5 rounded-lg shadow-lg pointer-events-none flex items-center gap-3 backdrop-blur-sm"
      >
        <span class="text-blue-300">Penjualan: Rp {d.sales.toLocaleString("id-ID")}</span>
        <span class="text-rose-300">Transaksi: {d.trxs} trx</span>
      </div>
    {/if}
  </div>
</div>
