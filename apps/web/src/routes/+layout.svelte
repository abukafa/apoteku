<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import { notificationStore } from "$lib/stores/notificationStore.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Navbar from "$lib/components/Navbar.svelte";
  import AlertHost from "$lib/components/ui/AlertHost.svelte";
  import { canAccessRoute, type UserRole as CoreUserRole } from "@apoteku/core";

  let { children } = $props();
  let isMobileOpen = $state(false);

  onMount(() => {
    tenantStore.fetchTenant();
    if (authStore.user) {
      notificationStore.fetchNotifications();
      notificationStore.startPolling(60000);
    }
    return () => {
      notificationStore.stopPolling();
    };
  });

  // Standalone routes without sidebar and top navbar: /login, /register, unauthenticated state, and /pos (if not GUEST)
  let isStandaloneRoute = $derived(
    !authStore.user ||
    $page.url.pathname.startsWith("/login") ||
    $page.url.pathname.startsWith("/register") ||
    ($page.url.pathname.startsWith("/pos") && authStore.user?.role !== "GUEST")
  );

  // ACCESS CONTROL GUARD (Sentralisasi @apoteku/core):
  // - Authenticated users cannot access /login -> redirect to role default route
  // - Unauthenticated users on protected routes -> redirect to /login
  // - Evaluasi rute berdasarkan wewenang peran (canAccessRoute)
  $effect(() => {
    if (typeof window !== "undefined") {
      const pathname = $page.url.pathname;
      const isGoogleCallback = $page.url.searchParams.get("google_success") === "true";

      if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
        if (authStore.user && !isGoogleCallback) {
          goto(authStore.getDefaultRoute(), { replaceState: true });
        }
        return;
      }

      if (!authStore.user) {
        goto("/login", { replaceState: true });
        return;
      }

      const role = (authStore.user.role === "INVENTORY_STAFF"
        ? "INVENTORY"
        : authStore.user.role || "GUEST") as CoreUserRole;

      const access = canAccessRoute(role, pathname, authStore.user.permissions);
      if (!access.allowed) {
        goto(access.redirectTo || authStore.getDefaultRoute(), { replaceState: true });
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

<!-- GLOBAL REUSABLE ALERT & TOAST HOST -->
<AlertHost />
