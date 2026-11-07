import { Elysia, t } from "elysia";
import { db, schema } from "@apoteku/db";
import { eq, or, and, sql } from "drizzle-orm";

export const authRoutes = new Elysia({ prefix: "/api" })
  // 1. AUTH LOGIN
  .post(
    "/auth/login",
    async ({ body, set }) => {
      try {
        const identifier = (body.identifier || "").trim().toLowerCase();
        const pin = (body.pin || "").trim();

        if (!identifier || !pin) {
          set.status = 400;
          return { success: false, error: "Username dan PIN wajib diisi" };
        }

        // Query user with branch
        const [user] = await db
          .select({
            id: schema.users.id,
            tenantId: schema.users.tenantId,
            branchId: schema.users.branchId,
            username: schema.users.username,
            fullName: schema.users.fullName,
            email: schema.users.email,
            phone: schema.users.phone,
            role: schema.users.role,
            pin: schema.users.pin,
            avatarUrl: schema.users.avatarUrl,
            isActive: schema.users.isActive,
            branchName: schema.branches.name,
            branchCode: schema.branches.code
          })
          .from(schema.users)
          .leftJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
          .where(
            or(
              eq(sql`LOWER(${schema.users.username})`, identifier),
              eq(sql`LOWER(${schema.users.email})`, identifier)
            )
          )
          .limit(1);

        if (!user || !user.isActive) {
          set.status = 401;
          return { success: false, error: "Pengguna tidak ditemukan atau tidak aktif" };
        }

        // Check PIN (gunakan default "123456" jika kolom pin di DB masih null/kosong)
        const expectedPin = (user.pin || "123456").trim();
        if (expectedPin !== pin) {
          set.status = 401;
          return { success: false, error: "PIN yang dimasukkan salah" };
        }

        // Resolve active branch (gunakan branchId pilihan saat login jika valid, atau default user/cabang pertama)
        let activeBranchId = user.branchId;
        let activeBranchName = user.branchName || "Apotek Hafidz Farma";
        let activeBranchCode = user.branchCode || "PUSAT";

        if (body.branchId && body.branchId !== "1" && body.branchId !== user.branchId) {
          const [selectedBranch] = await db
            .select({
              id: schema.branches.id,
              name: schema.branches.name,
              code: schema.branches.code
            })
            .from(schema.branches)
            .where(eq(schema.branches.id, body.branchId))
            .limit(1);
          if (selectedBranch) {
            activeBranchId = selectedBranch.id;
            activeBranchName = selectedBranch.name;
            activeBranchCode = selectedBranch.code;
          }
        } else if (!activeBranchId) {
          const [firstBranch] = await db
            .select({
              id: schema.branches.id,
              name: schema.branches.name,
              code: schema.branches.code
            })
            .from(schema.branches)
            .limit(1);
          if (firstBranch) {
            activeBranchId = firstBranch.id;
            activeBranchName = firstBranch.name;
            activeBranchCode = firstBranch.code;
          }
        }

        // Determine permissions based on role
        let permissions: string[] = ["pos:read", "pos:write", "stok:read"];
        if (user.role === "SUPERADMIN" || user.role === "OWNER") {
          permissions = ["*"];
        } else if (user.role === "PHARMACIST") {
          permissions = ["pos:read", "pos:write", "stok:read", "stok:write", "pelayanan:write", "laporan:read"];
        } else if (user.role === "INVENTORY") {
          permissions = ["stok:read", "stok:write", "pembelian:read", "pembelian:write", "pengiriman:write"];
        } else if (user.role === "FINANCE") {
          permissions = ["keuangan:read", "keuangan:write", "laporan:read", "pembelian:read"];
        } else if (user.role === "GUEST") {
          permissions = [];
        }

        return {
          success: true,
          message: `Selamat datang, ${user.fullName}`,
          data: {
            user: {
              id: user.id,
              tenantId: user.tenantId,
              branchId: activeBranchId,
              branchName: activeBranchName,
              branchCode: activeBranchCode,
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              phone: user.phone,
              role: user.role,
              avatarUrl: user.avatarUrl,
              permissions
            },
            token: `demo-token-${user.id}-${Date.now()}`
          }
        };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        identifier: t.String(),
        pin: t.String(),
        branchId: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Login Pegawai Menggunakan Username / Email dan PIN"
      }
    }
  )

  // 1b. AUTH STATUS (Check whether system is initialized with at least 1 user)
  .get(
    "/auth/status",
    async () => {
      try {
        const [{ totalUsers }] = await db
          .select({ totalUsers: sql<number>`count(*)::int` })
          .from(schema.users);

        return {
          success: true,
          data: {
            userCount: totalUsers,
            isInitialized: totalUsers > 0
          }
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      detail: {
        tags: ["Auth & Users"],
        summary: "Status Inisialisasi Akun Sistem"
      }
    }
  )

  // 1c. AUTH REGISTER (Pengguna pertama otomatis jadi SUPERADMIN)
  .post(
    "/auth/register",
    async ({ body, set }) => {
      try {
        const fullName = (body.fullName || "").trim();
        const username = (body.username || "").trim().toLowerCase();
        const pin = (body.pin || "").trim();
        const email = body.email ? body.email.trim().toLowerCase() : undefined;
        const phone = body.phone ? body.phone.trim() : undefined;
        const password = body.password ? body.password.trim() : undefined;

        if (!fullName || !username || !pin) {
          set.status = 400;
          return { success: false, error: "Nama lengkap, username, dan PIN wajib diisi" };
        }

        if (pin.length < 4) {
          set.status = 400;
          return { success: false, error: "PIN minimal harus 4 digit angka" };
        }

        // Get tenant
        const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
        if (!tenant) throw new Error("Tenant utama belum dibuat di database");

        // Check if username or email already exists
        const [existing] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            or(
              eq(sql`LOWER(${schema.users.username})`, username),
              email ? eq(sql`LOWER(${schema.users.email})`, email) : sql`FALSE`
            )
          )
          .limit(1);

        if (existing) {
          set.status = 400;
          return { success: false, error: "Username atau email tersebut sudah terdaftar di sistem" };
        }

        // Count existing users to determine first user
        const [{ totalUsers }] = await db
          .select({ totalUsers: sql<number>`count(*)::int` })
          .from(schema.users);

        // First user auto-assigned SUPERADMIN (Highest Level)
        const isFirstUser = totalUsers === 0;
        const assignedRole = isFirstUser ? "SUPERADMIN" : (body.role || "GUEST");

        // Determine branch (use provided or fallback to first branch)
        let targetBranchId = body.branchId;
        if (!targetBranchId) {
          const [firstBranch] = await db.select({ id: schema.branches.id }).from(schema.branches).limit(1);
          targetBranchId = firstBranch?.id;
        }

        const [createdUser] = await db
          .insert(schema.users)
          .values({
            tenantId: tenant.id,
            branchId: targetBranchId,
            username,
            fullName,
            email: email || `${username}@apoteku.local`,
            phone,
            role: assignedRole,
            pin,
            passwordHash: password || pin,
            isActive: true
          })
          .returning();

        // Get branch details
        let branchName = "Apotek Hafidz Farma Pusat";
        let branchCode = "PUSAT";
        if (targetBranchId) {
          const [br] = await db
            .select({ name: schema.branches.name, code: schema.branches.code })
            .from(schema.branches)
            .where(eq(schema.branches.id, targetBranchId))
            .limit(1);
          if (br) {
            branchName = br.name;
            branchCode = br.code;
          }
        }

        const permissions = assignedRole === "SUPERADMIN" || assignedRole === "OWNER"
          ? ["*"]
          : assignedRole === "GUEST"
            ? []
            : ["pos:read", "pos:write", "stok:read"];

        return {
          success: true,
          isFirstUser,
          message: isFirstUser
            ? `Pendaftaran berhasil! Karena Anda adalah pengguna pertama, akun otomatis ditetapkan sebagai SUPER ADMIN (Level Teratas).`
            : `Pendaftaran berhasil! Akun telah dibuat dengan peran ${assignedRole}.`,
          data: {
            user: {
              id: createdUser.id,
              tenantId: createdUser.tenantId,
              branchId: createdUser.branchId,
              branchName,
              branchCode,
              username: createdUser.username,
              fullName: createdUser.fullName,
              email: createdUser.email,
              phone: createdUser.phone,
              role: createdUser.role,
              permissions
            },
            token: `token-${createdUser.id}-${Date.now()}`
          }
        };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        fullName: t.String(),
        username: t.String(),
        pin: t.String(),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        password: t.Optional(t.String()),
        branchId: t.Optional(t.String()),
        role: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Pendaftaran Pengguna Baru (Pengguna Pertama Otomatis Superadmin)"
      }
    }
  )

  // 1d. GOOGLE AUTH CONFIG (Get client ID for frontend Google Identity Services)
  .get(
    "/auth/google/config",
    () => {
      const clientId =
        process.env.GOOGLE_CLIENT_ID ||
        process.env.PUBLIC_GOOGLE_CLIENT_ID ||
        "";
      const redirectUri =
        process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:5173/api/auth/google/callback";

      return {
        success: true,
        data: {
          clientId: clientId.trim(),
          redirectUri,
          isConfigured: true
        }
      };
    },
    {
      detail: {
        tags: ["Auth & Users"],
        summary: "Ambil Konfigurasi Google OAuth Publik"
      }
    }
  )

  // 1e. GOOGLE AUTH VERIFY & LOGIN
  .post(
    "/auth/google",
    async ({ body, set }) => {
      try {
        const credential = body.credential || body.idToken;
        const accessToken = body.accessToken;

        if (!credential && !accessToken) {
          set.status = 400;
          return { success: false, error: "Google Credential atau Access Token wajib disertakan" };
        }

        let email = "";
        let fullName = "";
        let avatarUrl: string | undefined = undefined;

        if (accessToken) {
          // Verify access token by querying official Google UserInfo endpoint
          const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` }
          });

          if (!userInfoRes.ok) {
            set.status = 401;
            return {
              success: false,
              error: "Token akses Google tidak valid atau otorisasi telah kedaluwarsa"
            };
          }

          const userProfile = (await userInfoRes.json()) as Record<string, any>;
          email = (userProfile.email || "").toLowerCase().trim();
          fullName = userProfile.name || userProfile.given_name || email.split("@")[0] || "Pengguna Google";
          avatarUrl = userProfile.picture || undefined;
        } else if (credential) {
          // Verify ID Token with Google official tokeninfo endpoint
          const googleRes = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
          );

          if (!googleRes.ok) {
            const errData = (await googleRes.json().catch(() => ({}))) as Record<string, any>;
            set.status = 401;
            return {
              success: false,
              error: errData.error_description || "Token Google tidak valid atau telah kedaluwarsa"
            };
          }

          const payload = (await googleRes.json()) as Record<string, any>;
          email = (payload.email || "").toLowerCase().trim();
          fullName = payload.name || payload.given_name || email.split("@")[0] || "Pengguna Google";
          avatarUrl = payload.picture || undefined;
        }

        if (!email) {
          set.status = 400;
          return { success: false, error: "Email Google tidak dapat diverifikasi dari akun Google Anda" };
        }

        // Fetch tenant
        const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
        if (!tenant) throw new Error("Tenant utama belum dibuat di database");

        // 1. Check if user already exists with this email
        const [existingUser] = await db
          .select({
            id: schema.users.id,
            tenantId: schema.users.tenantId,
            branchId: schema.users.branchId,
            username: schema.users.username,
            fullName: schema.users.fullName,
            email: schema.users.email,
            phone: schema.users.phone,
            role: schema.users.role,
            pin: schema.users.pin,
            avatarUrl: schema.users.avatarUrl,
            isActive: schema.users.isActive,
            branchName: schema.branches.name,
            branchCode: schema.branches.code
          })
          .from(schema.users)
          .leftJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
          .where(eq(sql`LOWER(${schema.users.email})`, email))
          .limit(1);

        if (existingUser) {
          if (!existingUser.isActive) {
            set.status = 403;
            return { success: false, error: "Akun Anda dinonaktifkan. Hubungi Administrator." };
          }

          // Update avatar from Google if changed or new
          if (avatarUrl && existingUser.avatarUrl !== avatarUrl) {
            await db
              .update(schema.users)
              .set({ avatarUrl })
              .where(eq(schema.users.id, existingUser.id));
            existingUser.avatarUrl = avatarUrl;
          }

          let permissions = ["pos:read", "pos:write", "stok:read"];
          if (existingUser.role === "SUPERADMIN" || existingUser.role === "OWNER") {
            permissions = ["*"];
          } else if (existingUser.role === "PHARMACIST") {
            permissions = ["pos:read", "pos:write", "stok:read", "stok:write", "pelayanan:write", "laporan:read"];
          } else if (existingUser.role === "INVENTORY") {
            permissions = ["stok:read", "stok:write", "pembelian:read", "pembelian:write", "pengiriman:write"];
          } else if (existingUser.role === "FINANCE") {
            permissions = ["keuangan:read", "keuangan:write", "laporan:read", "pembelian:read"];
          } else if (existingUser.role === "GUEST") {
            permissions = [];
          }

          return {
            success: true,
            isNewUser: false,
            message: `Selamat datang kembali, ${existingUser.fullName}!`,
            data: {
              user: {
                id: existingUser.id,
                tenantId: existingUser.tenantId,
                branchId: existingUser.branchId,
                branchName: existingUser.branchName || "Apotek Hafidz Farma Pusat",
                branchCode: existingUser.branchCode || "PUSAT",
                username: existingUser.username,
                fullName: existingUser.fullName,
                email: existingUser.email,
                phone: existingUser.phone,
                role: existingUser.role,
                pin: existingUser.pin || "123456",
                avatarUrl: existingUser.avatarUrl || avatarUrl,
                permissions
              },
              token: `google-token-${existingUser.id}-${Date.now()}`
            }
          };
        }

        // 2. User doesn't exist -> Check if first user in database
        const [{ totalUsers }] = await db
          .select({ totalUsers: sql<number>`count(*)::int` })
          .from(schema.users);

        const isFirstUser = totalUsers === 0;
        const assignedRole = isFirstUser ? "SUPERADMIN" : "GUEST";

        // Generate clean username from email
        let baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        if (baseUsername.length < 3) baseUsername = `user_${baseUsername}`;

        // Ensure username is unique
        const [usernameConflict] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(sql`LOWER(${schema.users.username})`, baseUsername))
          .limit(1);

        if (usernameConflict) {
          baseUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
        }

        // Target Branch
        let targetBranchId = body.branchId;
        let branchName = "Apotek Hafidz Farma Pusat";
        let branchCode = "PUSAT";

        if (targetBranchId) {
          const [br] = await db
            .select({ id: schema.branches.id, name: schema.branches.name, code: schema.branches.code })
            .from(schema.branches)
            .where(eq(schema.branches.id, targetBranchId))
            .limit(1);
          if (br) {
            branchName = br.name;
            branchCode = br.code;
          }
        } else {
          const [firstBranch] = await db
            .select({ id: schema.branches.id, name: schema.branches.name, code: schema.branches.code })
            .from(schema.branches)
            .limit(1);
          if (firstBranch) {
            targetBranchId = firstBranch.id;
            branchName = firstBranch.name;
            branchCode = firstBranch.code;
          }
        }

        const defaultPin = "123456";

        const [createdUser] = await db
          .insert(schema.users)
          .values({
            tenantId: tenant.id,
            branchId: targetBranchId,
            username: baseUsername,
            fullName,
            email,
            role: assignedRole,
            pin: defaultPin,
            passwordHash: defaultPin,
            avatarUrl,
            isActive: true
          })
          .returning();

        const permissions = assignedRole === "SUPERADMIN" ? ["*"] : [];

        return {
          success: true,
          isNewUser: true,
          isFirstUser,
          message: isFirstUser
            ? `Pendaftaran berhasil! Karena Anda adalah pengguna pertama, akun Google Anda otomatis ditetapkan sebagai SUPER ADMIN (Level Teratas).`
            : `Pendaftaran berhasil! Akun Google Anda terdaftar sebagai Tamu (GUEST). Menunggu persetujuan hak akses oleh Administrator/Owner.`,
          data: {
            user: {
              id: createdUser.id,
              tenantId: createdUser.tenantId,
              branchId: createdUser.branchId,
              branchName,
              branchCode,
              username: createdUser.username,
              fullName: createdUser.fullName,
              email: createdUser.email,
              phone: createdUser.phone,
              role: createdUser.role,
              pin: createdUser.pin || defaultPin,
              avatarUrl: createdUser.avatarUrl,
              permissions
            },
            token: `google-token-${createdUser.id}-${Date.now()}`
          }
        };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        credential: t.Optional(t.String()),
        idToken: t.Optional(t.String()),
        accessToken: t.Optional(t.String()),
        branchId: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Autentikasi & Registrasi Menggunakan Akun Google"
      }
    }
  )

  // 1f. GOOGLE OAUTH 2.0 CALLBACK (Redirect Flow)
  .get(
    "/auth/google/callback",
    async ({ query, redirect }) => {
      const frontendUrl = process.env.PUBLIC_FRONTEND_URL || "http://localhost:5173";
      try {
        const code = query.code;
        const error = query.error;

        if (error) {
          return redirect(`${frontendUrl}/login?error=${encodeURIComponent(`Google login dibatalkan: ${error}`)}`, 302);
        }

        if (!code) {
          return redirect(`${frontendUrl}/login?error=${encodeURIComponent("Authorization code Google tidak ditemukan")}`, 302);
        }

        const clientId =
          process.env.GOOGLE_CLIENT_ID ||
          process.env.PUBLIC_GOOGLE_CLIENT_ID ||
          "";

        const clientSecret =
          process.env.GOOGLE_CLIENT_SECRET ||
          "";

        const redirectUri =
          process.env.GOOGLE_REDIRECT_URI ||
          "http://localhost:5173/api/auth/google/callback";

        // Exchange code for tokens with Google
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code"
          })
        });

        if (!tokenRes.ok) {
          const errData = (await tokenRes.json().catch(() => ({}))) as Record<string, any>;
          const errMsg = errData.error_description || errData.error || "Gagal menukar token dengan Google";
          return redirect(`${frontendUrl}/login?error=${encodeURIComponent(errMsg)}`, 302);
        }

        const tokenData = (await tokenRes.json()) as Record<string, any>;
        const accessToken = tokenData.access_token;

        // Fetch user profile from Google UserInfo
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!userInfoRes.ok) {
          return redirect(`${frontendUrl}/login?error=${encodeURIComponent("Gagal mengambil profil pengguna dari Google")}`, 302);
        }

        const userProfile = (await userInfoRes.json()) as Record<string, any>;
        const email = (userProfile.email || "").toLowerCase().trim();
        const fullName = userProfile.name || userProfile.given_name || email.split("@")[0] || "Pengguna Google";
        const avatarUrl = userProfile.picture || undefined;

        if (!email) {
          return redirect(`${frontendUrl}/login?error=${encodeURIComponent("Email tidak ditemukan dari akun Google Anda")}`, 302);
        }

        // Fetch tenant
        const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
        if (!tenant) {
          return redirect(`${frontendUrl}/login?error=${encodeURIComponent("Tenant utama belum dibuat di database")}`, 302);
        }

        // 1. Check if user already exists
        const [existingUser] = await db
          .select({
            id: schema.users.id,
            tenantId: schema.users.tenantId,
            branchId: schema.users.branchId,
            username: schema.users.username,
            fullName: schema.users.fullName,
            email: schema.users.email,
            phone: schema.users.phone,
            role: schema.users.role,
            pin: schema.users.pin,
            avatarUrl: schema.users.avatarUrl,
            isActive: schema.users.isActive,
            branchName: schema.branches.name,
            branchCode: schema.branches.code
          })
          .from(schema.users)
          .leftJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
          .where(eq(sql`LOWER(${schema.users.email})`, email))
          .limit(1);

        let activeUserPayload: any = null;

        if (existingUser) {
          if (!existingUser.isActive) {
            return redirect(`${frontendUrl}/login?error=${encodeURIComponent("Akun dinonaktifkan. Hubungi Administrator.")}`, 302);
          }

          if (avatarUrl && existingUser.avatarUrl !== avatarUrl) {
            await db
              .update(schema.users)
              .set({ avatarUrl })
              .where(eq(schema.users.id, existingUser.id));
            existingUser.avatarUrl = avatarUrl;
          }

          let permissions = ["pos:read", "pos:write", "stok:read"];
          if (existingUser.role === "SUPERADMIN" || existingUser.role === "OWNER") {
            permissions = ["*"];
          } else if (existingUser.role === "PHARMACIST") {
            permissions = ["pos:read", "pos:write", "stok:read", "stok:write", "pelayanan:write", "laporan:read"];
          } else if (existingUser.role === "INVENTORY") {
            permissions = ["stok:read", "stok:write", "pembelian:read", "pembelian:write", "pengiriman:write"];
          } else if (existingUser.role === "FINANCE") {
            permissions = ["keuangan:read", "keuangan:write", "laporan:read", "pembelian:read"];
          } else if (existingUser.role === "GUEST") {
            permissions = [];
          }

          activeUserPayload = {
            id: existingUser.id,
            tenantId: existingUser.tenantId,
            branchId: existingUser.branchId,
            branchName: existingUser.branchName || "Apotek Hafidz Farma Pusat",
            branchCode: existingUser.branchCode || "PUSAT",
            username: existingUser.username,
            fullName: existingUser.fullName,
            email: existingUser.email,
            phone: existingUser.phone,
            role: existingUser.role,
            pin: existingUser.pin || "123456",
            avatarUrl: existingUser.avatarUrl || avatarUrl,
            permissions,
            isFirstUser: false
          };
        } else {
          // Check if first user in database
          const [{ totalUsers }] = await db
            .select({ totalUsers: sql<number>`count(*)::int` })
            .from(schema.users);

          const isFirstUser = totalUsers === 0;
          const assignedRole = isFirstUser ? "SUPERADMIN" : "GUEST";

          let baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          if (baseUsername.length < 3) baseUsername = `user_${baseUsername}`;

          const [usernameConflict] = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(sql`LOWER(${schema.users.username})`, baseUsername))
            .limit(1);

          if (usernameConflict) {
            baseUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
          }

          const [firstBranch] = await db
            .select({ id: schema.branches.id, name: schema.branches.name, code: schema.branches.code })
            .from(schema.branches)
            .limit(1);

          const defaultPin = "123456";

          const [newUser] = await db
            .insert(schema.users)
            .values({
              tenantId: tenant.id,
              branchId: firstBranch?.id,
              username: baseUsername,
              fullName,
              email,
              role: assignedRole,
              pin: defaultPin,
              passwordHash: defaultPin,
              avatarUrl,
              isActive: true
            })
            .returning();

          const permissions = assignedRole === "SUPERADMIN" ? ["*"] : [];

          activeUserPayload = {
            id: newUser.id,
            tenantId: newUser.tenantId,
            branchId: newUser.branchId,
            branchName: firstBranch?.name || "Apotek Hafidz Farma Pusat",
            branchCode: firstBranch?.code || "PUSAT",
            username: newUser.username,
            fullName: newUser.fullName,
            email: newUser.email,
            phone: newUser.phone,
            role: newUser.role,
            pin: newUser.pin || defaultPin,
            avatarUrl: newUser.avatarUrl,
            permissions,
            isFirstUser
          };
        }

        const sessionToken = `google-session-${activeUserPayload.id}-${Date.now()}`;
        const encodedUser = encodeURIComponent(JSON.stringify(activeUserPayload));

        return redirect(`${frontendUrl}/login?google_success=true&token=${sessionToken}&user_data=${encodedUser}`, 302);
      } catch (err: any) {
        return redirect(`${frontendUrl}/login?error=${encodeURIComponent(err.message || "Terjadi kesalahan autentikasi Google")}`, 302);
      }
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        error: t.Optional(t.String()),
        scope: t.Optional(t.String()),
        authuser: t.Optional(t.String()),
        prompt: t.Optional(t.String()),
        iss: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Callback Otorisasi Google OAuth 2.0"
      }
    }
  )

  // 2. GET ALL USERS
  .get(
    "/users",
    async ({ query }) => {
      try {
        const usersList = await db
          .select({
            id: schema.users.id,
            tenantId: schema.users.tenantId,
            username: schema.users.username,
            fullName: schema.users.fullName,
            email: schema.users.email,
            phone: schema.users.phone,
            role: schema.users.role,
            pin: schema.users.pin,
            avatarUrl: schema.users.avatarUrl,
            isActive: schema.users.isActive,
            branchId: schema.users.branchId,
            branchName: schema.branches.name
          })
          .from(schema.users)
          .leftJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
          .orderBy(schema.users.fullName);

        return {
          success: true,
          data: usersList.map((u) => ({
            id: u.id,
            tenantId: u.tenantId,
            username: u.username,
            fullName: u.fullName,
            email: u.email || `${u.username}@hafidzfarma.com`,
            phone: u.phone || "081234567890",
            role: u.role,
            branchId: u.branchId,
            branchName: u.branchName || "Apotek Hafidz Farma Pusat",
            hasPin: Boolean(u.pin),
            avatarUrl: u.avatarUrl || undefined,
            isActive: u.isActive
          }))
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      detail: {
        tags: ["Auth & Users"],
        summary: "Daftar Seluruh Pengguna & Pegawai Apotek"
      }
    }
  )

  // 3. CREATE USER
  .post(
    "/users",
    async ({ body, set }) => {
      try {
        const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
        if (!tenant) throw new Error("Tenant not found");

        const [created] = await db
          .insert(schema.users)
          .values({
            tenantId: tenant.id,
            branchId: body.branchId,
            username: body.username.trim().toLowerCase(),
            fullName: body.fullName.trim(),
            email: body.email,
            phone: body.phone,
            role: body.role,
            pin: body.pin || "123456",
            avatarUrl: body.avatarUrl,
            isActive: true
          })
          .returning();

        return {
          success: true,
          message: `Pengguna ${created.fullName} berhasil ditambahkan`,
          data: created
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        username: t.String(),
        fullName: t.String(),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        role: t.String(),
        pin: t.Optional(t.String()),
        branchId: t.Optional(t.String()),
        avatarUrl: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Tambah Pengguna Pegawai Baru"
      }
    }
  )

  // 3b. UPDATE USER (UBAH ROLE / CABANG / STATUS OLEH SUPERADMIN)
  .put(
    "/users/:id",
    async ({ params, body, set }) => {
      try {
        const updateData: Record<string, any> = {};
        if (body.role !== undefined) updateData.role = body.role;
        if (body.branchId !== undefined) updateData.branchId = body.branchId;
        if (body.fullName !== undefined) updateData.fullName = body.fullName.trim();
        if (body.email !== undefined) updateData.email = body.email.trim();
        if (body.phone !== undefined) updateData.phone = body.phone.trim();
        if (body.pin !== undefined) updateData.pin = body.pin.trim();
        if (body.isActive !== undefined) updateData.isActive = body.isActive;

        const [updated] = await db
          .update(schema.users)
          .set(updateData)
          .where(eq(schema.users.id, params.id))
          .returning();

        if (!updated) {
          set.status = 404;
          return { success: false, error: "Pengguna tidak ditemukan" };
        }

        return {
          success: true,
          message: `Hak akses / data pengguna ${updated.fullName} berhasil diperbarui`,
          data: updated
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        role: t.Optional(t.String()),
        branchId: t.Optional(t.String()),
        fullName: t.Optional(t.String()),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        pin: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Perbarui Role / Hak Akses Pengguna"
      }
    }
  )

  // 3c. DELETE USER
  .delete(
    "/users/:id",
    async ({ params, set }) => {
      try {
        const [deleted] = await db
          .delete(schema.users)
          .where(eq(schema.users.id, params.id))
          .returning();

        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Pengguna tidak ditemukan" };
        }

        return {
          success: true,
          message: `Pengguna ${deleted.fullName} berhasil dihapus`
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Hapus Pengguna dari Sistem"
      }
    }
  )

  // 4. TENANT (GET & UPDATE MASTER ORGANISASI)
  .get(
    "/tenant",
    async ({ headers }) => {
      try {
        const headerTenantId = headers["x-tenant-id"];
        let tenantRow: typeof schema.tenants.$inferSelect | undefined;
        if (headerTenantId && /^[0-9a-fA-F-]{36}$/.test(headerTenantId)) {
          const [found] = await db
            .select()
            .from(schema.tenants)
            .where(eq(schema.tenants.id, headerTenantId))
            .limit(1);
          tenantRow = found;
        }
        if (!tenantRow) {
          const [first] = await db.select().from(schema.tenants).limit(1);
          tenantRow = first;
        }
        if (!tenantRow) {
          return { success: false, error: "Data tenant belum ditemukan di database" };
        }
        return {
          success: true,
          data: {
            id: tenantRow.id,
            code: tenantRow.code,
            name: tenantRow.name,
            taxPercent: Number(tenantRow.taxPercent || 11),
            isActive: tenantRow.isActive,
            createdAt: tenantRow.createdAt
          }
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      detail: {
        tags: ["Auth & Users"],
        summary: "Ambil Profil Organisasi / Tenant Utama"
      }
    }
  )

  .put(
    "/tenant",
    async ({ body, set }) => {
      try {
        let targetId = body.id;
        if (!targetId || !/^[0-9a-fA-F-]{36}$/.test(targetId)) {
          const [first] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
          if (!first) {
            set.status = 404;
            return { success: false, error: "Tenant tidak ditemukan" };
          }
          targetId = first.id;
        }

        const updatePayload: Record<string, any> = {};
        if (body.code !== undefined) updatePayload.code = body.code.trim().toUpperCase();
        if (body.name !== undefined) updatePayload.name = body.name.trim();
        if (body.taxPercent !== undefined) updatePayload.taxPercent = String(Number(body.taxPercent));
        if (body.isActive !== undefined) updatePayload.isActive = Boolean(body.isActive);

        const [updated] = await db
          .update(schema.tenants)
          .set(updatePayload)
          .where(eq(schema.tenants.id, targetId))
          .returning();

        if (!updated) {
          set.status = 404;
          return { success: false, error: "Tenant tidak ditemukan" };
        }

        return {
          success: true,
          message: `Data organisasi "${updated.name}" berhasil diperbarui`,
          data: {
            id: updated.id,
            code: updated.code,
            name: updated.name,
            taxPercent: Number(updated.taxPercent || 11),
            isActive: updated.isActive,
            createdAt: updated.createdAt
          }
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        id: t.Optional(t.String()),
        code: t.Optional(t.String()),
        name: t.Optional(t.String()),
        taxPercent: t.Optional(t.Number()),
        isActive: t.Optional(t.Boolean())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Perbarui Data Organisasi / Tenant (Superadmin & Owner)"
      }
    }
  )

  // 5. GET ALL BRANCHES (BESERTA LOKASI INVENTORI PER CABANG)
  .get(
    "/branches",
    async () => {
      try {
        const [branchList, locationList] = await Promise.all([
          db
            .select({
              id: schema.branches.id,
              tenantId: schema.branches.tenantId,
              code: schema.branches.code,
              name: schema.branches.name,
              address: schema.branches.address,
              phone: schema.branches.phone,
              receiptHeader: schema.branches.receiptHeader,
              receiptFooter: schema.branches.receiptFooter,
              createdAt: schema.branches.createdAt
            })
            .from(schema.branches)
            .orderBy(schema.branches.code),
          db
            .select({
              id: schema.inventoryLocations.id,
              tenantId: schema.inventoryLocations.tenantId,
              branchId: schema.inventoryLocations.branchId,
              code: schema.inventoryLocations.code,
              name: schema.inventoryLocations.name,
              isDefault: schema.inventoryLocations.isDefault,
              isActive: schema.inventoryLocations.isActive
            })
            .from(schema.inventoryLocations)
            .orderBy(schema.inventoryLocations.code)
        ]);

        const locationsByBranch = new Map<string, typeof locationList>();
        for (const loc of locationList) {
          const list = locationsByBranch.get(loc.branchId) || [];
          list.push(loc);
          locationsByBranch.set(loc.branchId, list);
        }

        return {
          success: true,
          data: branchList.map((b) => ({
            id: b.id,
            tenantId: b.tenantId,
            code: b.code,
            name: b.name,
            address: b.address || "",
            phone: b.phone || "",
            receiptHeader: b.receiptHeader || b.name,
            receiptFooter: b.receiptFooter || "Semoga lekas sembuh. Terima kasih.",
            createdAt: b.createdAt,
            locations: locationsByBranch.get(b.id) || []
          }))
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      detail: {
        tags: ["Auth & Users"],
        summary: "Daftar Seluruh Cabang Apotek & Titik Lokasi Inventori"
      }
    }
  )

  // 5b. CREATE NEW BRANCH (+ OPSIONAL LOKASI INVENTORI DEFAULT)
  .post(
    "/branches",
    async ({ body, set }) => {
      try {
        const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
        if (!tenant) {
          set.status = 400;
          return { success: false, error: "Tenant belum tersedia di database" };
        }

        const code = body.code.trim().toUpperCase();
        const name = body.name.trim();
        if (!code || !name) {
          set.status = 400;
          return { success: false, error: "Kode cabang dan nama cabang wajib diisi" };
        }

        const [createdBranch] = await db
          .insert(schema.branches)
          .values({
            tenantId: tenant.id,
            code,
            name,
            address: body.address?.trim() || null,
            phone: body.phone?.trim() || null,
            receiptHeader: body.receiptHeader?.trim() || name,
            receiptFooter: body.receiptFooter?.trim() || "Semoga lekas sembuh. Terima kasih."
          })
          .returning();

        const createdLocations: any[] = [];
        if (body.createDefaultLocation !== false) {
          const locCode = (body.defaultLocationCode || `${code}-UTAMA`).trim().toUpperCase();
          const locName = (body.defaultLocationName || `Etalase & Gudang ${name}`).trim();
          const [loc] = await db
            .insert(schema.inventoryLocations)
            .values({
              tenantId: tenant.id,
              branchId: createdBranch.id,
              code: locCode,
              name: locName,
              isDefault: true,
              isActive: true
            })
            .returning();
          if (loc) createdLocations.push(loc);
        }

        return {
          success: true,
          message: `Cabang "${createdBranch.name}" berhasil ditambahkan`,
          data: {
            ...createdBranch,
            locations: createdLocations
          }
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        code: t.String(),
        name: t.String(),
        address: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        receiptHeader: t.Optional(t.String()),
        receiptFooter: t.Optional(t.String()),
        createDefaultLocation: t.Optional(t.Boolean()),
        defaultLocationCode: t.Optional(t.String()),
        defaultLocationName: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Tambah Cabang Baru Beserta Lokasi Inventori Utama"
      }
    }
  )

  // 5c. UPDATE BRANCH
  .put(
    "/branches/:id",
    async ({ params, body, set }) => {
      try {
        const updatePayload: Record<string, any> = {};
        if (body.code !== undefined) updatePayload.code = body.code.trim().toUpperCase();
        if (body.name !== undefined) updatePayload.name = body.name.trim();
        if (body.address !== undefined) updatePayload.address = body.address.trim();
        if (body.phone !== undefined) updatePayload.phone = body.phone.trim();
        if (body.receiptHeader !== undefined) updatePayload.receiptHeader = body.receiptHeader.trim();
        if (body.receiptFooter !== undefined) updatePayload.receiptFooter = body.receiptFooter.trim();

        const [updated] = await db
          .update(schema.branches)
          .set(updatePayload)
          .where(eq(schema.branches.id, params.id))
          .returning();

        if (!updated) {
          set.status = 404;
          return { success: false, error: "Cabang tidak ditemukan" };
        }

        const branchLocations = await db
          .select()
          .from(schema.inventoryLocations)
          .where(eq(schema.inventoryLocations.branchId, updated.id))
          .orderBy(schema.inventoryLocations.code);

        return {
          success: true,
          message: `Cabang ${updated.name} berhasil diperbarui`,
          data: {
            ...updated,
            locations: branchLocations
          }
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.Optional(t.String()),
        address: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        receiptHeader: t.Optional(t.String()),
        receiptFooter: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Perbarui Informasi Cabang Apotek"
      }
    }
  )

  // 6. INVENTORY LOCATIONS (LOKASI SIMPAN STOK PER CABANG)
  .get(
    "/inventory-locations",
    async ({ query }) => {
      try {
        const branchId = query.branch_id;
        const rows = await db
          .select({
            id: schema.inventoryLocations.id,
            tenantId: schema.inventoryLocations.tenantId,
            branchId: schema.inventoryLocations.branchId,
            code: schema.inventoryLocations.code,
            name: schema.inventoryLocations.name,
            isDefault: schema.inventoryLocations.isDefault,
            isActive: schema.inventoryLocations.isActive,
            branchName: schema.branches.name,
            branchCode: schema.branches.code
          })
          .from(schema.inventoryLocations)
          .leftJoin(schema.branches, eq(schema.inventoryLocations.branchId, schema.branches.id))
          .where(branchId ? eq(schema.inventoryLocations.branchId, branchId) : undefined)
          .orderBy(schema.inventoryLocations.code);

        return {
          success: true,
          data: rows
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Daftar Lokasi Penyimpanan Inventori (Etalase / Gudang)"
      }
    }
  )

  .post(
    "/inventory-locations",
    async ({ body, set }) => {
      try {
        const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
        if (!tenant) {
          set.status = 400;
          return { success: false, error: "Tenant tidak ditemukan" };
        }

        const code = body.code.trim().toUpperCase();
        const name = body.name.trim();
        if (!body.branchId || !code || !name) {
          set.status = 400;
          return { success: false, error: "Cabang, kode lokasi, dan nama lokasi wajib diisi" };
        }

        if (body.isDefault) {
          await db
            .update(schema.inventoryLocations)
            .set({ isDefault: false })
            .where(eq(schema.inventoryLocations.branchId, body.branchId));
        }

        const [created] = await db
          .insert(schema.inventoryLocations)
          .values({
            tenantId: tenant.id,
            branchId: body.branchId,
            code,
            name,
            isDefault: Boolean(body.isDefault),
            isActive: body.isActive !== false
          })
          .returning();

        return {
          success: true,
          message: `Lokasi inventori "${created.name}" berhasil ditambahkan`,
          data: created
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        branchId: t.String(),
        code: t.String(),
        name: t.String(),
        isDefault: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Tambah Lokasi Penyimpanan Inventori Baru pada Cabang"
      }
    }
  )

  .put(
    "/inventory-locations/:id",
    async ({ params, body, set }) => {
      try {
        const [existing] = await db
          .select()
          .from(schema.inventoryLocations)
          .where(eq(schema.inventoryLocations.id, params.id))
          .limit(1);

        if (!existing) {
          set.status = 404;
          return { success: false, error: "Lokasi inventori tidak ditemukan" };
        }

        const targetBranchId = body.branchId || existing.branchId;
        if (body.isDefault) {
          await db
            .update(schema.inventoryLocations)
            .set({ isDefault: false })
            .where(eq(schema.inventoryLocations.branchId, targetBranchId));
        }

        const updatePayload: Record<string, any> = {};
        if (body.branchId !== undefined) updatePayload.branchId = body.branchId;
        if (body.code !== undefined) updatePayload.code = body.code.trim().toUpperCase();
        if (body.name !== undefined) updatePayload.name = body.name.trim();
        if (body.isDefault !== undefined) updatePayload.isDefault = Boolean(body.isDefault);
        if (body.isActive !== undefined) updatePayload.isActive = Boolean(body.isActive);

        const [updated] = await db
          .update(schema.inventoryLocations)
          .set(updatePayload)
          .where(eq(schema.inventoryLocations.id, params.id))
          .returning();

        return {
          success: true,
          message: `Lokasi inventori "${updated.name}" berhasil diperbarui`,
          data: updated
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        branchId: t.Optional(t.String()),
        code: t.Optional(t.String()),
        name: t.Optional(t.String()),
        isDefault: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean())
      }),
      detail: {
        tags: ["Auth & Users"],
        summary: "Perbarui Lokasi Penyimpanan Inventori"
      }
    }
  );
