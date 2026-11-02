<script lang="ts">
  import { BarChart3 } from "lucide-svelte";

  // Data matching mockup.jpeg
  const days = [
    { label: "21 Okt", sales: 2.6, salesStr: "Rp 2.600.000", trxs: 14 },
    { label: "22 Okt", sales: 2.3, salesStr: "Rp 2.300.000", trxs: 15 },
    { label: "23 Okt", sales: 2.9, salesStr: "Rp 2.900.000", trxs: 16 },
    { label: "24 Okt", sales: 3.0, salesStr: "Rp 3.000.000", trxs: 18 },
    { label: "25 Okt", sales: 3.3, salesStr: "Rp 3.300.000", trxs: 21 },
    { label: "26 Okt", sales: 4.2, salesStr: "Rp 4.200.000", trxs: 25 },
    { label: "27 Okt", sales: 4.85, salesStr: "Rp 4.850.000", trxs: 28 }
  ];

  let hoveredIndex = $state<number | null>(null);

  // SVG Coordinates calculation (Width: 500, Height: 200, padding: 30)
  const width = 500;
  const height = 180;
  const paddingX = 40;
  const paddingY = 25;
  const maxSales = 5.5; // Up to 5.5 jt
  const maxTrx = 35; // Up to 35 trx

  function getSalesY(val: number) {
    const ratio = val / maxSales;
    return height - paddingY - ratio * (height - 2 * paddingY);
  }

  function getTrxY(val: number) {
    const ratio = val / maxTrx;
    return height - paddingY - ratio * (height - 2 * paddingY);
  }

  function getX(idx: number) {
    return paddingX + (idx / (days.length - 1)) * (width - 2 * paddingX);
  }

  // Construct SVG paths
  const salesPath = days
    .map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getSalesY(d.sales)}`)
    .join(" ");

  const trxPath = days
    .map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getTrxY(d.trxs)}`)
    .join(" ");

  // Gradient area path for sales
  const salesAreaPath = `${salesPath} L ${getX(days.length - 1)} ${height - paddingY} L ${getX(0)} ${height - paddingY} Z`;
</script>

<div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
  <!-- HEADER & LEGEND -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
    <div class="flex items-center gap-2">
      <BarChart3 class="w-4 h-4 text-[#0c2e7a]" />
      <h3 class="text-sm font-bold text-slate-800">Grafik Penjualan 7 Hari Terakhir</h3>
    </div>
    <!-- Legend -->
    <div class="flex items-center gap-4 text-xs font-semibold">
      <div class="flex items-center gap-1.5 text-slate-600">
        <span class="w-2.5 h-2.5 rounded-full bg-[#1d63d8]"></span>
        <span>Penjualan</span>
      </div>
      <div class="flex items-center gap-1.5 text-slate-600">
        <span class="w-2.5 h-2.5 rounded-full bg-[#df1c2d]"></span>
        <span>Transaksi</span>
      </div>
    </div>
  </div>

  <!-- SVG CHART CONTAINER -->
  <div class="relative w-full aspect-[2.4/1] min-h-[170px]">
    <svg viewBox="0 0 {width} {height}" class="w-full h-full overflow-visible">
      <defs>
        <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1d63d8" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#1d63d8" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Y Axis Grid Lines -->
      {#each [0, 2, 4, 5] as gridVal}
        {@const y = getSalesY(gridVal)}
        <line
          x1={paddingX}
          y1={y}
          x2={width - paddingX}
          y2={y}
          stroke="#f1f5f9"
          stroke-dasharray="3 3"
        />
        <text
          x={paddingX - 8}
          y={y + 3}
          fill="#94a3b8"
          font-size="9"
          font-weight="600"
          text-anchor="end"
        >
          {gridVal} jt
        </text>
      {/each}

      <!-- Sales Area Fill -->
      <path d={salesAreaPath} fill="url(#salesGradient)" />

      <!-- Sales Line (Blue) -->
      <path
        d={salesPath}
        fill="none"
        stroke="#1d63d8"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Transactions Line (Red) -->
      <path
        d={trxPath}
        fill="none"
        stroke="#df1c2d"
        stroke-width="2"
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
            y1={paddingY}
            x2={sx}
            y2={height - paddingY}
            stroke="#cbd5e1"
            stroke-dasharray="2 2"
          />
        {/if}

        <!-- Sales Blue Dot -->
        <circle
          cx={sx}
          cy={sy}
          r={isHovered ? "5" : "3.5"}
          fill="#1d63d8"
          stroke="#ffffff"
          stroke-width="2"
          class="transition-all duration-150"
        />

        <!-- Trx Red Dot -->
        <circle
          cx={sx}
          cy={ty}
          r={isHovered ? "4.5" : "3"}
          fill="#df1c2d"
          stroke="#ffffff"
          stroke-width="1.5"
          class="transition-all duration-150"
        />

        <!-- X Axis Label -->
        <text
          x={sx}
          y={height - 6}
          fill="#64748b"
          font-size="9.5"
          font-weight="600"
          text-anchor="middle"
        >
          {day.label}
        </text>
      {/each}
    </svg>

    <!-- Tooltip on hover -->
    {#if hoveredIndex !== null}
      {@const d = days[hoveredIndex]}
      <div
        class="absolute -top-1 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-semibold py-1 px-2.5 rounded-lg shadow-lg pointer-events-none flex items-center gap-3 backdrop-blur-sm"
      >
        <span class="text-cyan-300 font-bold">{d.label}</span>
        <span class="text-blue-300">Penjualan: {d.salesStr}</span>
        <span class="text-rose-300">Transaksi: {d.trxs} trx</span>
      </div>
    {/if}
  </div>
</div>
