import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIngredientSelectedUomAndQty1700000000001 implements MigrationInterface {
  name = 'AddIngredientSelectedUomAndQty1700000000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ingredients"
      ADD COLUMN IF NOT EXISTS "selected_uom_code" VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS "selected_qty" NUMERIC(12,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "ingredients"
      ADD CONSTRAINT IF NOT EXISTS "fk_ingredients_selected_uom"
      FOREIGN KEY ("selected_uom_code") REFERENCES "units_of_measure"("code") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "fk_ingredients_selected_uom"
    `);
    await queryRunner.query(`
      ALTER TABLE "ingredients" DROP COLUMN IF EXISTS "selected_uom_code"
    `);
    await queryRunner.query(`
      ALTER TABLE "ingredients" DROP COLUMN IF EXISTS "selected_qty"
    `);
  }
}
