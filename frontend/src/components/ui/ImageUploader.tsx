import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { imagenThumb } from "../../lib/inmuebles";
import { Button } from "./Button";

/** Deben coincidir con los límites de @fastify/multipart y imagenes.service.ts. */
const MAX_IMAGENES = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploaderProps {
  inmuebleId: string;
  /** Fotos ya guardadas. Cuentan contra el tope de 10. */
  imagenes: string[];
  onChange: (imagenes: string[]) => void;
}

interface Seleccion {
  file: File;
  preview: string;
}

export function ImageUploader({
  inmuebleId,
  imagenes,
  onChange,
}: ImageUploaderProps) {
  const [seleccion, setSeleccion] = useState<Seleccion[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Las object URLs no se liberan solas. Las que se quitan a mano o ya se
  // subieron se revocan en su sitio; este efecto sólo barre lo que quede al
  // desmontar. Va contra un ref y con deps vacías a propósito: si dependiera de
  // `seleccion`, cada cambio revocaría los previews del render anterior, que
  // siguen en pantalla.
  const seleccionRef = useRef<Seleccion[]>([]);
  useEffect(() => {
    seleccionRef.current = seleccion;
  }, [seleccion]);
  useEffect(() => {
    return () => {
      seleccionRef.current.forEach((s) => URL.revokeObjectURL(s.preview));
    };
  }, []);

  const cupo = MAX_IMAGENES - imagenes.length - seleccion.length;

  const agregar = (archivos: FileList | null) => {
    if (!archivos) return;
    setError("");

    const validos: Seleccion[] = [];
    for (const file of Array.from(archivos)) {
      if (validos.length >= cupo) {
        setError(`Máximo ${MAX_IMAGENES} fotos por inmueble`);
        break;
      }
      if (!TIPOS.includes(file.type)) {
        setError("Sólo se aceptan imágenes JPEG, PNG o WebP");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" pesa más de ${MAX_BYTES / 1024 / 1024} MB`);
        continue;
      }
      validos.push({ file, preview: URL.createObjectURL(file) });
    }

    setSeleccion((previa) => [...previa, ...validos]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const quitarSeleccion = (indice: number) => {
    setSeleccion((previa) => {
      URL.revokeObjectURL(previa[indice].preview);
      return previa.filter((_, i) => i !== indice);
    });
  };

  const subir = async () => {
    if (seleccion.length === 0) return;
    setSubiendo(true);
    setError("");
    try {
      const form = new FormData();
      seleccion.forEach((s) => form.append("imagenes", s.file));

      // api.ts omite el Content-Type cuando el body es FormData, para que el
      // navegador ponga el boundary del multipart.
      const res = await apiFetch<{ success: boolean; imagenes: string[] }>(
        `/inmuebles/${inmuebleId}/imagenes`,
        { method: "POST", body: form },
      );

      seleccion.forEach((s) => URL.revokeObjectURL(s.preview));
      setSeleccion([]);
      onChange(res.imagenes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron subir las fotos");
    } finally {
      setSubiendo(false);
    }
  };

  const borrar = async (url: string) => {
    setError("");
    try {
      const res = await apiFetch<{ success: boolean; imagenes: string[] }>(
        `/inmuebles/${inmuebleId}/imagenes`,
        { method: "DELETE", body: JSON.stringify({ url }) },
      );
      onChange(res.imagenes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la foto");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Fotos del inmueble</p>
          <p className="text-xs text-slate-500">
            {imagenes.length + seleccion.length} de {MAX_IMAGENES} · JPEG, PNG o WebP
            hasta {MAX_BYTES / 1024 / 1024} MB
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={cupo <= 0 || subiendo}
          onClick={() => inputRef.current?.click()}
        >
          Añadir fotos
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => agregar(e.target.files)}
      />

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {(imagenes.length > 0 || seleccion.length > 0) && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3 list-none p-0 m-0">
          {imagenes.map((url) => (
            <li key={url} className="relative aspect-square rounded-xl overflow-hidden">
              <img
                src={imagenThumb(url, 200, 200)}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => borrar(url)}
                aria-label="Quitar foto"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/70 text-white text-sm leading-none hover:bg-red-600"
              >
                ×
              </button>
            </li>
          ))}
          {seleccion.map((s, indice) => (
            <li
              key={s.preview}
              className="relative aspect-square rounded-xl overflow-hidden ring-2 ring-emerald-400"
            >
              <img src={s.preview} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => quitarSeleccion(indice)}
                aria-label={`Quitar ${s.file.name} de la selección`}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/70 text-white text-sm leading-none hover:bg-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {seleccion.length > 0 && (
        <Button type="button" size="sm" onClick={subir} disabled={subiendo}>
          {subiendo ? "Subiendo…" : `Subir ${seleccion.length} foto${seleccion.length > 1 ? "s" : ""}`}
        </Button>
      )}
    </div>
  );
}
