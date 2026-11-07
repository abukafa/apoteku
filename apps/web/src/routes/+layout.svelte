<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authStore } from "$lib/stores/authStore.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Navbar from "$lib/components/Navbar.svelte";

  let { children } = $props();
  let isMobileOpen = $state(false);

  // Standalone routes without sidebar and top navbar: /login, /register, unauthenticated state, and /pos (if not GUEST)
  let isStandaloneRoute = $derived(
    !authStore.user ||
    $page.url.pathname.startsWith("/login") ||
    $page.url.pathname.startsWith("/register") ||
    ($page.url.pathname.startsWith("/pos") && authStore.user?.role !== "GUEST")
  );

  // ACCESS CONTROL GUARD:
  // - Authenticated users cannot access /login -> redirect to /
  // - Unauthenticated users on protected routes -> redirect to /login
  // - GUEST user can only access /pengaturan?tab=profil
  $effect(() => {
    if (typeof window !== "undefined") {
      const pathname = $page.url.pathname;
      const isGoogleCallback = $page.url.searchParams.get("google_success") === "true";

      if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
        if (authStore.user && !isGoogleCallback) {
          goto(authStore.user.role === "GUEST" ? "/pengaturan?tab=profil" : "/", { replaceState: true });
        }
        return;
      }

      if (!authStore.user) {
        goto("/login", { replaceState: true });
        return;
      }

      if (authStore.user.role === "GUEST") {
        if (!pathname.startsWith("/pengaturan")) {
          goto("/pengaturan?tab=profil", { replaceState: true });
        }
      }
    }
  });
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
