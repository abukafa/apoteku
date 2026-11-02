<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Navbar from "$lib/components/Navbar.svelte";

  let { children } = $props();
  let isMobileOpen = $state(false);

  let isPosRoute = $derived(page.url.pathname.startsWith("/pos"));
</script>

{#if isPosRoute}
  <!-- FULL SCREEN MODE FOR POS CASHIER -->
  {@render children()}
{:else}
  <!-- MAIN APPLICATION LAYOUT (DASHBOARD & ERP) MATCHING MOCKUP.JPEG -->
  <div class="min-h-screen bg-[#f0f4f9] text-slate-800 font-sans flex">
    <!-- LEFT FIXED SIDEBAR -->
    <Sidebar bind:isMobileOpen />

    <!-- MAIN APP CONTAINER -->
    <div class="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">
      <!-- TOPBAR NAVBAR -->
      <Navbar onToggleMobileMenu={() => (isMobileOpen = !isMobileOpen)} />

      <!-- CONTENT BODY -->
      <main class="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
        {@render children()}
      </main>
    </div>
  </div>
{/if}
