<script lang="ts">
  // HeroBanner matching mockup.jpeg
</script>

<div class="relative w-full rounded-2xl overflow-hidden bg-gradient-to-r from-[#eef5fd] via-[#f7faff] to-[#e8f1fc] border border-blue-100 shadow-sm min-h-[175px] sm:min-h-[195px] flex items-center px-6 sm:px-10 py-5">
  <!-- Pharmacy background texture overlay with smooth blur -->
  <div class="absolute inset-0 z-0 mix-blend-multiply">
    <img
      src="/img/banner.png"
      alt="Apotek Hafidz Farma Interior"
      class="w-full h-full object-cover object-right"
    />
  </div>

  <!-- Decorative Blue & White Flow Wave -->
  <div class="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-white/60 to-transparent pointer-events-none"></div>

  <!-- CONTENT -->
  <div class="relative z-10 w-full flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
    <!-- LEFT: WELCOME TITLE & BRAND -->
    <div class="max-w-xl">
      <div class="text-sm sm:text-base font-semibold text-slate-700 tracking-wide">
        Selamat Datang di
      </div>
      <div class="relative inline-block mt-0.5">
        <h1 class="text-3xl sm:text-4xl lg:text-5xl font-black text-[#0c2e7a] tracking-tight">
          Hafidz <span class="text-[#df1c2d]">Farma</span>
        </h1>
        <!-- Red curved accent swoosh -->
        <svg class="w-full h-3 -mt-1 text-[#df1c2d]" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 9C50 2 150 2 198 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </div>

      <div class="font-script text-[#0c2e7a] text-xl sm:text-2xl mt-1 tracking-wider italic font-bold">
        Ikhtiar sehat keluarga
      </div>
    </div>

    <!-- RIGHT: FAMILY HEART BADGE & CALLIGRAPHY SLOGAN -->
    <div class="flex items-center gap-6 self-end md:self-center pr-2 sm:pr-4">
      <!-- Calligraphy Slogan matching mockup -->
      <div class="hidden sm:block text-right">
        <div class="font-script text-[#0c2e7a] text-2xl lg:text-3xl font-extrabold leading-snug">
          Sehat<br />
          Bersama<br />
          Hafidz Farma
        </div>
      </div>
    </div>
  </div>
</div>
