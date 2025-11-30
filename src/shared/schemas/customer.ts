// shared/schemas/customer.ts
import { z } from "zod";
import { CustomerType, Gender } from "src/common/enums"; // đường dẫn BE

export const customerTypeSchema = z.nativeEnum(CustomerType);
export const genderSchema = z.nativeEnum(Gender).nullable().optional();

export const createCustomerSchema = z
  .object({
    type: customerTypeSchema,              // ⇒ CustomerType
    name: z.string().min(1, "Tên khách hàng là bắt buộc"),

    code: z.string().trim().max(32).optional().or(z.literal("")),
    companyName: z.string().trim().max(180).optional().or(z.literal("")),
    phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
    email: z.string().trim().email().max(180).optional().or(z.literal("")),
    taxNo: z.string().trim().max(32).optional().or(z.literal("")),
    identityNo: z.string().trim().max(32).optional().or(z.literal("")),

    gender: genderSchema,                  // ⇒ Gender | null | undefined
    birthday: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh không hợp lệ")
      .optional()
      .or(z.literal("")),

    address: z.string().trim().optional().or(z.literal("")),
    province: z.string().trim().optional().or(z.literal("")),
    district: z.string().trim().optional().or(z.literal("")),
    ward: z.string().trim().optional().or(z.literal("")),
    note: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.type === CustomerType.COMPANY && !data.companyName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "Tên công ty là bắt buộc khi loại khách là Công ty",
      });
    }
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
