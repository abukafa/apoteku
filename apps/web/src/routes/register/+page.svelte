<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowRight, Sparkles } from "lucide-svelte";

  onMount(() => {
    // Auto redirect to login because registration is handled directly via Google OAuth
    const timer = setTimeout(() => {
      goto("/login");
    }, 1000);
    return () => clearTimeout(timer);
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl space-y-4 border border-slate-100">
    <div class="w-14 h-14 bg-blue-50 text-[#1d63d8] rounded-2xl flex items-center justify-center mx-auto shadow-sm">
      <Sparkles class="w-7 h-7" />
    </div>
    <h2 class="text-base font-bold text-slate-800">Pendaftaran Otomatis Terpadu</h2>
    <p class="text-xs text-slate-500 leading-relaxed">
      Sistem Apoteku menggunakan registrasi otomatis via Google Workspace. Anda tidak perlu mengisi formulir manual. Mengalihkan ke halaman login...
    </p>
    <div class="pt-2">
      <a
        href="/login"
        class="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1d63d8] hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-blue-600/20"
      >
        <span>Ke Halaman Login</span>
        <ArrowRight class="w-4 h-4" />
      </a>
    </div>
  </div>
</div>
