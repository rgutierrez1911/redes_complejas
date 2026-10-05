"""
Script de conversión de Markdown a Word (.docx) utilizando Pandoc (vía pypandoc).
Convierte automáticamente ecuaciones LaTeX a objetos matemáticos nativos de Word (OMML),
tablas estructuradas, encabezados y citas bibliográficas.
"""

import sys
import pypandoc

def convert_md_to_docx(input_md: str = "ARTICULO_CIENTIFICO.md", output_docx: str = "ARTICULO_CIENTIFICO.docx"):
    print(f"[Pandoc] Convirtiendo '{input_md}' a '{output_docx}'...")
    extra_args = [
        "--toc",               # Opcional: Tabla de contenido si se requiere
        "--standalone",
    ]
    try:
        pypandoc.convert_file(
            input_md,
            "docx",
            outputfile=output_docx,
            extra_args=["--standalone"]
        )
        print(f"[Pandoc] ¡Conversión completada con éxito! Archivo generado: {output_docx}")
    except Exception as e:
        print(f"[Error] Falló la conversión: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    convert_md_to_docx()
