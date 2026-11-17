<script lang="ts">
  import type { Snippet } from "svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import type { PermissionKey } from "@apoteku/core";

  interface Props {
    permission?: PermissionKey;
    permissions?: PermissionKey[];
    children?: Snippet;
    fallback?: Snippet;
  }

  let { permission, permissions, children, fallback }: Props = $props();

  let isAllowed = $derived.by(() => {
    if (permission) {
      return authStore.can(permission);
    }
    if (permissions && permissions.length > 0) {
      return authStore.canAny(permissions);
    }
    return true;
  });
</script>

{#if isAllowed}
  {@render children?.()}
{:else if fallback}
  {@render fallback()}
{/if}
