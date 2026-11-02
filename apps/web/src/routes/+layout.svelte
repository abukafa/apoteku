<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Navbar from "$lib/components/Navbar.svelte";

  let { children } = $props();
  let isMobileOpen = $state(false);

  // Unauthenticated routes (like /login) render standalone without the app shell
  let isAuthRoute = $derived(page.url.pathname.startsWith("/login"));
  let isPosRoute = $derived(page.url.pathname.startsWith("/pos"));
</script>

{#if isAuthRoute}
  <!-- UNBOUND STANDALONE LAYOUT (LOGIN, REGISTER, ETC) -->
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

      <!-- CONTENT BODY -->
      {#if isPosRoute}
        <!-- POS VIEWPORT OPTIMIZED (FULL HEIGHT DOCKING) -->
        <main class="flex-1 flex flex-col min-w-0 p-3 sm:p-4 overflow-hidden h-[calc(100vh-65px)]">
          {@render children()}
        </main>
      {:else}
        <!-- STANDARD DASHBOARD / ERP PADDING -->
        <main class="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
          {@render children()}
        </main>
      {/if}
    </div>
  </div>
{/if}
