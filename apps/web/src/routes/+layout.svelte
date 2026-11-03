<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Navbar from "$lib/components/Navbar.svelte";

  let { children } = $props();
  let isMobileOpen = $state(false);

  // Standalone routes without sidebar and top navbar: /login and /pos
  let isStandaloneRoute = $derived(
    page.url.pathname.startsWith("/login") || page.url.pathname.startsWith("/pos")
  );
</script>

{#if isStandaloneRoute}
  <!-- UNBOUND STANDALONE FULLSCREEN LAYOUT (LOGIN, POS KASIR FULL SCREEN) -->
  {@render children()}
{:else}
  <!-- AUTHENTICATED SHARED APPLICATION SHELL -->
  <div class="min-h-screen bg-[#f0f4f9] text-slate-800 font-sans flex">
    <!-- LEFT FIXED SIDEBAR -->
    <Sidebar bind:isMobileOpen />

    <!-- MAIN APP CONTAINER -->
    <div class="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">
      <!-- TOPBAR NAVBAR -->
      <Navbar onToggleMobileMenu={() => (isMobileOpen = !isMobileOpen)} />

      <!-- STANDARD DASHBOARD / ERP PADDING -->
      <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        {@render children()}
      </main>
    </div>
  </div>
{/if}
