<script lang="ts">
  import { LayoutGrid } from "lucide-svelte";

  const menus = [
    { name: "Penjualan", href: "/penjualan", icon: "/img/icon-penjualan.png" },
    { name: "Pembelian", href: "/pembelian", icon: "/img/icon-pembelian.png" },
    { name: "Stok Obat", href: "/stok", icon: "/img/icon-obat.png" },
    { name: "Pelayanan Kefarmasian", href: "/pelayanan", icon: "/img/icon-pelayanan.png" },
    { name: "Retur", href: "/retur", icon: "/img/icon-return.png" },
    { name: "Pelanggan", href: "/pelanggan", icon: "/img/icon-pelanggan.png" },
    { name: "Supplier / PBF", href: "/supplier", icon: "/img/icon-suplier.png" },
    { name: "Keuangan", href: "/keuangan", icon: "/img/icon-keuangan.png" },
    { name: "Laporan", href: "/laporan", icon: "/img/icon-laporan.png" },
    { name: "Pengaturan", href: "/pengaturan", icon: "/img/icon-pengaturan.png" }
  ];
</script>

<div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
  <div class="flex items-center gap-2 mb-4">
    <LayoutGrid class="w-4 h-4 text-[#0c2e7a]" />
    <h3 class="text-sm font-bold text-slate-800">Menu Utama</h3>
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
    {#each menus as m}
      <a
        href={m.href}
        class="group flex flex-col items-center justify-center p-3.5 rounded-2xl bg-[#f8faff] hover:bg-white border border-blue-100/70 hover:border-blue-300 hover:shadow-md transition-all duration-200 text-center"
      >
        <div class="w-12 h-12 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200">
          <img
            src={m.icon}
            alt={m.name}
            class="w-full h-full object-contain drop-shadow-sm"
          />
        </div>
        <span class="text-xs font-bold text-slate-700 group-hover:text-[#0c2e7a] transition-colors leading-tight line-clamp-2">
          {m.name}
        </span>
      </a>
    {/each}
  </div>
</div>
