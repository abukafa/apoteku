<script lang="ts">
  interface Props {
    type?:
      | "BEBAS"
      | "BEBAS_TERBATAS"
      | "KERAS"
      | "PSIKOTROPIKA"
      | "NARKOTIKA"
      | "HERBAL"
      | "ALKES"
      | "NON_OBAT"
      | "SUCCESS"
      | "WARNING"
      | "DANGER"
      | "INFO"
      | "NEUTRAL";
    label?: string;
    size?: "sm" | "md";
  }

  let { type = "NEUTRAL", label, size = "sm" }: Props = $props();

  function getBadgeConfig(t: string, customLabel?: string) {
    switch (t) {
      case "BEBAS":
        return {
          text: customLabel || "Bebas",
          dot: "bg-emerald-500",
          style: "bg-emerald-50 text-emerald-700 border-emerald-200"
        };
      case "BEBAS_TERBATAS":
        return {
          text: customLabel || "Bebas Terbatas",
          dot: "bg-sky-500",
          style: "bg-sky-50 text-sky-700 border-sky-200"
        };
      case "KERAS":
        return {
          text: customLabel || "Obat Keras (K)",
          dot: "bg-red-600",
          style: "bg-red-50 text-red-700 border-red-200 font-bold"
        };
      case "PSIKOTROPIKA":
        return {
          text: customLabel || "Psikotropika",
          dot: "bg-purple-600",
          style: "bg-purple-50 text-purple-700 border-purple-200 font-bold"
        };
      case "NARKOTIKA":
        return {
          text: customLabel || "Narkotika",
          dot: "bg-rose-700",
          style: "bg-rose-50 text-rose-800 border-rose-300 font-bold"
        };
      case "HERBAL":
        return {
          text: customLabel || "Herbal / Jamu",
          dot: "bg-teal-600",
          style: "bg-teal-50 text-teal-700 border-teal-200"
        };
      case "ALKES":
        return {
          text: customLabel || "Alat Kesehatan",
          dot: "bg-cyan-600",
          style: "bg-cyan-50 text-cyan-700 border-cyan-200"
        };
      case "SUCCESS":
        return {
          text: customLabel || "Selesai / Lunas",
          dot: "bg-emerald-500",
          style: "bg-emerald-50 text-emerald-700 border-emerald-200"
        };
      case "WARNING":
        return {
          text: customLabel || "Peringatan",
          dot: "bg-amber-500",
          style: "bg-amber-50 text-amber-700 border-amber-200"
        };
      case "DANGER":
        return {
          text: customLabel || "Kritis / Jatuh Tempo",
          dot: "bg-red-600",
          style: "bg-red-50 text-red-700 border-red-200 font-bold"
        };
      case "INFO":
        return {
          text: customLabel || "Informasi",
          dot: "bg-blue-600",
          style: "bg-blue-50 text-blue-700 border-blue-200"
        };
      default:
        return {
          text: customLabel || "Netral",
          dot: "bg-slate-400",
          style: "bg-slate-100 text-slate-700 border-slate-200"
        };
    }
  }

  let config = $derived(getBadgeConfig(type, label));
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-full border {config.style} {size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-semibold tracking-wide"
>
  <span class="w-1.5 h-1.5 rounded-full {config.dot} flex-shrink-0"></span>
  <span class="truncate">{config.text}</span>
</span>
