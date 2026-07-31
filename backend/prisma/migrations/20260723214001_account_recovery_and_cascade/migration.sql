-- DropForeignKey
ALTER TABLE "Inmueble" DROP CONSTRAINT "Inmueble_usuarioId_fkey";

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "eliminacionProgramadaEn" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Inmueble" ADD CONSTRAINT "Inmueble_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
