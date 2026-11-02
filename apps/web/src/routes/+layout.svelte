<script lang="ts">
  import "../app.css";
  let { children } = $props();
</script>

<div class="min-h-screen flex flex-col bg-surface-base">
  {@render children()}
</div>
