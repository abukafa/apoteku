import { Elysia, t } from "elysia";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const mediaRoutes = new Elysia({ prefix: "/api/uploads" }).post(
  "",
  async ({ body, set }) => {
    try {
      const { file, category } = body;
      const targetCategory = category || "general";
      const uploadDir = join(process.cwd(), "uploads", targetCategory);

      // Ensure directory exists
      await mkdir(uploadDir, { recursive: true });

      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filename = `${timestamp}_${sanitizedName}`;
      const filePath = join(uploadDir, filename);

      // Bun native stream file write
      await Bun.write(filePath, file);

      return {
        success: true,
        filename,
        category: targetCategory,
        size: file.size,
        mimeType: file.type,
        url: `/uploads/${targetCategory}/${filename}`
      };
    } catch (err: any) {
      set.status = 500;
      return {
        success: false,
        error: err?.message || "Failed to upload file"
      };
    }
  },
  {
    body: t.Object({
      file: t.File({
        description: "Image or PDF file (Resep Dokter / Faktur PBF)",
        maxSize: 10 * 1024 * 1024 // 10MB limit
      }),
      category: t.Optional(
        t.Union([
          t.Literal("prescriptions"),
          t.Literal("invoices"),
          t.Literal("general")
        ])
      )
    }),
    detail: {
      tags: ["Media"],
      summary: "Upload Foto Resep Dokter / Scan Faktur PBF",
      description:
        "Menyimpan berkas media resep atau faktur ke volume lokal dengan Bun.write streaming"
    }
  }
);
