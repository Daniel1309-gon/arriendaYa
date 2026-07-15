-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "zonasInteres" TEXT[],
    "edad" INTEGER,
    "ciudadOrigen" TEXT,
    "telefono" TEXT,
    "presupuestoMin" DECIMAL(65,30),
    "presupuestoMax" DECIMAL(65,30),
    "googleId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inmueble" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "valorCanon" DECIMAL(65,30) NOT NULL,
    "administracionIncluida" BOOLEAN NOT NULL,
    "valorAdministracion" DECIMAL(65,30),
    "tamanoM2" INTEGER NOT NULL,
    "habitaciones" INTEGER NOT NULL,
    "banos" INTEGER NOT NULL,
    "patio" BOOLEAN NOT NULL DEFAULT false,
    "parqueaderos" INTEGER NOT NULL DEFAULT 0,
    "antiguedadAnos" INTEGER NOT NULL,
    "estrato" INTEGER NOT NULL,
    "piso" INTEGER NOT NULL,
    "ascensor" BOOLEAN NOT NULL,
    "petFriendly" BOOLEAN NOT NULL DEFAULT false,
    "latitud" DECIMAL(65,30) NOT NULL,
    "longitud" DECIMAL(65,30) NOT NULL,
    "url" TEXT,

    CONSTRAINT "Inmueble_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_googleId_key" ON "Usuario"("googleId");

-- AddForeignKey
ALTER TABLE "Inmueble" ADD CONSTRAINT "Inmueble_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
