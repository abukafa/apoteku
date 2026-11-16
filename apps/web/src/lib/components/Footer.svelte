<script lang="ts">
  import { ShieldCheck, Activity } from "lucide-svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
</script>

<footer class="mt-8 pt-4 pb-6 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
  <div class="flex items-center gap-1.5 font-medium text-slate-600">
    <ShieldCheck class="w-4 h-4 text-[#0c2e7a]" />
    <span>&copy; {new Date().getFullYear()} Apotek {tenantStore.current.name || "Hafidz Farma"}. All rights reserved.</span>
  </div>

  <div class="flex items-center gap-2">
    <div class="w-7 h-7 rounded-full bg-blue-50 text-[#0c2e7a] flex items-center justify-center border border-blue-100 shadow-sm">
      <Activity class="w-3.5 h-3.5" />
    </div>
  </div>
</footer>
